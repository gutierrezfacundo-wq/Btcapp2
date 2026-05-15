package com.iptv.player.data.repository

import com.iptv.player.data.model.EpgProgram
import com.iptv.player.data.model.SourceConfig
import com.iptv.player.data.parser.XmltvParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

class EpgRepository(private val httpClient: OkHttpClient) {

    private val mutex = Mutex()
    private var cachedByTvgId: Map<String, List<EpgProgram>> = emptyMap()
    private var cachedAt: Long = 0L
    private val ttlMs = 30 * 60 * 1000L

    suspend fun load(source: SourceConfig): Map<String, List<EpgProgram>> = mutex.withLock {
        val now = System.currentTimeMillis()
        if (cachedByTvgId.isNotEmpty() && now - cachedAt < ttlMs) return@withLock cachedByTvgId
        val url = when (source) {
            is SourceConfig.M3u -> source.epgUrl
            is SourceConfig.Xtream -> source.xmltvUrl
        } ?: return@withLock emptyMap<String, List<EpgProgram>>().also { cachedByTvgId = it }

        runCatching {
            withContext(Dispatchers.IO) {
                val request = Request.Builder().url(url).build()
                httpClient.newCall(request).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext emptyList<EpgProgram>()
                    val stream = resp.body?.byteStream() ?: return@withContext emptyList<EpgProgram>()
                    XmltvParser.parse(stream)
                }
            }
        }.getOrDefault(emptyList())
            .groupBy { it.channelTvgId }
            .also {
                cachedByTvgId = it
                cachedAt = now
            }
    }

    fun nowPlaying(tvgId: String?): EpgProgram? {
        if (tvgId.isNullOrBlank()) return null
        val programs = cachedByTvgId[tvgId] ?: return null
        val now = System.currentTimeMillis()
        return programs.firstOrNull { now in it.startEpochMs..it.stopEpochMs }
    }
}
