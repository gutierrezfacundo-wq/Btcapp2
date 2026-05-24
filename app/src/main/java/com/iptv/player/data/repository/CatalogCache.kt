package com.iptv.player.data.repository

import android.content.Context
import com.iptv.player.data.model.SourceConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

class CatalogCache(appContext: Context) {

    private val dir = appContext.filesDir
    private val json = Json { ignoreUnknownKeys = true }

    private fun fileFor(key: String) = File(dir, "catalog_$key.json")

    suspend fun load(source: SourceConfig): Catalog? = withContext(Dispatchers.IO) {
        val f = fileFor(source.cacheKey())
        if (!f.exists()) return@withContext null
        runCatching { json.decodeFromString<Catalog>(f.readText()) }.getOrNull()
    }

    suspend fun save(source: SourceConfig, catalog: Catalog) {
        withContext(Dispatchers.IO) {
            runCatching { fileFor(source.cacheKey()).writeText(json.encodeToString(catalog)) }
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
