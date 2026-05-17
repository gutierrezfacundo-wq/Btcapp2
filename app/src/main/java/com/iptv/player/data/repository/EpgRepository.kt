package com.iptv.player.data.repository

import com.iptv.player.data.model.EpgProgram
import com.iptv.player.data.model.SourceConfig
import com.iptv.player.data.parser.XmltvParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

class EpgRepository(private val httpClient: OkHttpClient) {

    private val mutex = Mutex()
    private val _cache = MutableStateFlow<Map<String, List<EpgProgram>>>(emptyMap())
    val cache = _cache.asStateFlow()

    private var cachedAt: Long = 0L
    private val ttlMs = 30 * 60 * 1000L

    suspend fun load(source: SourceConfig): Map<String, List<EpgProgram>> = mutex.withLock {
        val now = System.currentTimeMillis()
        val current = _cache.value
        if (current.isNotEmpty() && now - cachedAt < ttlMs) return@withLock current
        val url = when (source) {
            is SourceConfig.M3u -> source.epgUrl
            is SourceConfig.Xtream -> source.xmltvUrl
        } ?: return@withLock emptyMap<String, List<EpgProgram>>().also {
            _cache.value = it
            cachedAt = now
        }

        val parsed = runCatching {
            withContext(Dispatchers.IO) {
                val request = Request.Builder().url(url).build()
                httpClient.newCall(request).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext emptyList<EpgProgram>()
                    val stream = resp.body?.byteStream() ?: return@withContext emptyList<EpgProgram>()
                    XmltvParser.parse(stream)
                }
            }
        }.getOrDefault(emptyList())

        val grouped = parsed.groupBy { it.channelTvgId }
        _cache.value = grouped
        cachedAt = now
        grouped
    }

    fun nowPlaying(tvgId: String?): EpgProgram? {
        if (tvgId.isNullOrBlank()) return null
        val programs = _cache.value[tvgId] ?: return null
        val now = System.currentTimeMillis()
        return programs.firstOrNull { now in it.startEpochMs..it.stopEpochMs }
    }

    fun nextProgram(tvgId: String?): EpgProgram? {
        if (tvgId.isNullOrBlank()) return null
        val programs = _cache.value[tvgId] ?: return null
        val now = System.currentTimeMillis()
        return programs
            .asSequence()
            .filter { it.startEpochMs > now }
            .minByOrNull { it.startEpochMs }
    }
}
