package com.iptv.player.ui.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import com.iptv.player.data.local.RecentEntity
import com.iptv.player.data.model.EpgProgram
import com.iptv.player.data.model.MediaKind
import com.iptv.player.di.AppContainer
import com.iptv.player.playback.PlaybackQueue
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch

data class EpgState(val now: EpgProgram? = null, val next: EpgProgram? = null)

@UnstableApi
class PlayerViewModel(private val container: AppContainer) : ViewModel() {

    val queue = container.playbackController.queue

    val player: ExoPlayer get() = container.playbackManager.player

    private val _epg = MutableStateFlow(EpgState())
    val epg = _epg.asStateFlow()

    private val tickerFlow = flow {
        while (true) {
            emit(System.currentTimeMillis())
            delay(30_000)
        }
    }

    init {
        viewModelScope.launch {
            runCatching {
                val source = container.playlistRepository.activeSource.filterNotNull().first()
                container.epgRepository.load(source)
            }
        }
        viewModelScope.launch {
            val epgMapFlow = container.database.epgMapDao().observeAll()
            combine(queue, container.epgRepository.cache, tickerFlow, epgMapFlow) { q, _, _, maps ->
                val active = (q as? PlaybackQueue.Live)?.active
                val tvgId = active?.let { ch ->
                    maps.firstOrNull { it.channelId == ch.id }?.tvgId ?: ch.tvgId
                }
                EpgState(
                    now = container.epgRepository.nowPlaying(tvgId),
                    next = container.epgRepository.nextProgram(tvgId),
                )
            }.collect { _epg.value = it }
        }
        viewModelScope.launch {
            queue.collect { q -> q?.let { recordRecent(it) } }
        }
    }

    suspend fun applyQueue(q: PlaybackQueue) {
        val url = q.streamUrl
        val seekTo = when (q) {
            is PlaybackQueue.Live -> 0L
            else -> container.database.recentDao().get(url)?.positionMs ?: 0L
        }
        container.playbackManager.play(url, seekTo)
    }

    fun selectIndex(index: Int) = container.playbackController.selectIndex(index)
    fun next() = container.playbackController.next()
    fun previous() = container.playbackController.previous()

    fun setPlayerVisible(visible: Boolean) {
        container.playbackController.setPlayerVisible(visible)
    }

    private fun recordRecent(q: PlaybackQueue) {
        val kind = q.kindOrdinal()
        viewModelScope.launch {
            container.database.recentDao().upsert(
                RecentEntity(
                    streamUrl = q.streamUrl,
                    title = q.title,
                    logoUrl = q.logoUrl,
                    kindOrdinal = kind,
                    positionMs = if (kind == MediaKind.LIVE.ordinal) 0L
                        else container.playbackManager.currentPosition.coerceAtLeast(0L),
                    durationMs = container.playbackManager.duration,
                    lastPlayedAt = System.currentTimeMillis(),
                )
            )
        }
    }

    fun savePosition() {
        val q = queue.value ?: return
        val kind = q.kindOrdinal()
        if (kind == MediaKind.LIVE.ordinal) return
        val pos = container.playbackManager.currentPosition
        val dur = container.playbackManager.duration
        viewModelScope.launch {
            container.database.recentDao().upsert(
                RecentEntity(
                    streamUrl = q.streamUrl,
                    title = q.title,
                    logoUrl = q.logoUrl,
                    kindOrdinal = kind,
                    positionMs = pos,
                    durationMs = dur,
                    lastPlayedAt = System.currentTimeMillis(),
                )
            )
        }
    }

    private fun PlaybackQueue.kindOrdinal(): Int = when (this) {
        is PlaybackQueue.Live -> MediaKind.LIVE.ordinal
        is PlaybackQueue.Episodes -> MediaKind.SERIES_EPISODE.ordinal
        is PlaybackQueue.Single -> MediaKind.MOVIE.ordinal
    }

    override fun onCleared() {
        super.onCleared()
        savePosition()
        // El ExoPlayer es singleton en PlaybackManager — no se libera aca.
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            PlayerViewModel(container) as T
    }
}
