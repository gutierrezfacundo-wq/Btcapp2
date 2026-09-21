package com.iptv.player.data.repository

import android.content.Context
import com.iptv.player.data.model.SourceConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import kotlinx.serialization.json.encodeToStream
import java.io.File

class CatalogCache(appContext: Context) {

    private val dir = appContext.filesDir
    private val json = Json { ignoreUnknownKeys = true }

    private fun fileFor(key: String) = File(dir, "catalog_$key.json")

    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    suspend fun load(source: SourceConfig): Catalog? = withContext(Dispatchers.IO) {
        val f = fileFor(source.cacheKey())
        if (!f.exists()) return@withContext null
        // Leemos como stream: readText() cargaba el JSON entero (decenas de MB en
        // catálogos grandes) a un String, y en equipos con poca RAM eso terminaba
        // en OutOfMemoryError silencioso — el catálogo quedaba sin cache.
        runCatching {
            f.inputStream().buffered().use { json.decodeFromStream<Catalog>(it) }
        }.getOrNull()
    }

    /** Edad del cache en ms; Long.MAX_VALUE si no existe. */
    fun ageMs(source: SourceConfig): Long {
        val f = fileFor(source.cacheKey())
        if (!f.exists()) return Long.MAX_VALUE
        return System.currentTimeMillis() - f.lastModified()
    }

    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    suspend fun save(source: SourceConfig, catalog: Catalog) {
        withContext(Dispatchers.IO) {
            // Igual que al leer: se escribe en streaming para no armar un String
            // gigante en memoria. Si algo falla, el archivo parcial se borra para
            // no dejar un cache corrupto que después cargue medio catálogo.
            val f = fileFor(source.cacheKey())
            runCatching {
                f.outputStream().buffered().use { json.encodeToStream(catalog, it) }
            }.onFailure { runCatching { f.delete() } }
        }
    }
}

private fun SourceConfig.cacheKey(): String {
    val raw = when (this) {
        is SourceConfig.M3u -> "m3u:$playlistUrl"
        is SourceConfig.Xtream -> "xt:$server:$username"
    }
    return Integer.toHexString(raw.hashCode())
}
