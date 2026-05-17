package com.iptv.player.ui.player

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
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

    private var _player: ExoPlayer? = null
    private var currentUrl: String? = null

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
                val source = container.preferencesStore.source.filterNotNull().first()
                container.epgRepository.load(source)
            }
        }
        viewModelScope.launch {
            combine(queue, container.epgRepository.cache, tickerFlow) { q, _, _ ->
                val tvgId = (q as? PlaybackQueue.Live)?.active?.tvgId
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

    fun ensurePlayer(context: Context): ExoPlayer {
        _player?.let { return it }
        val app = context.applicationContext
        val httpFactory = OkHttpDataSource.Factory(container.httpClient)
        val dataSourceFactory = DefaultDataSource.Factory(app, httpFactory)
        return ExoPlayer.Builder(app)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .build()
            .also { _player = it }
    }

    suspend fun applyQueue(q: PlaybackQueue, player: ExoPlayer) {
        val url = q.streamUrl
        if (url == currentUrl) return
        currentUrl = url
        val seekTo = when (q) {
            is PlaybackQueue.Live -> 0L
            else -> container.database.recentDao().get(url)?.positionMs ?: 0L
        }
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        if (seekTo > 0L) player.seekTo(seekTo)
        player.playWhenReady = true
    }

    fun selectIndex(index: Int) = container.playbackController.selectIndex(index)
    fun next() = container.playbackController.next()
    fun previous() = container.playbackController.previous()

    fun setPlayerVisible(visible: Boolean) {
        container.playbackController.setPlayerVisible(visible)
    }

    private fun recordRecent(q: PlaybackQueue) {
        val kind = q.kindOrdinal()
        val player = _player
        viewModelScope.launch {
            container.database.recentDao().upsert(
                RecentEntity(
                    streamUrl = q.streamUrl,
                    title = q.title,
                    logoUrl = q.logoUrl,
                    kindOrdinal = kind,
                    positionMs = if (kind == MediaKind.LIVE.ordinal) 0L
                        else (player?.currentPosition?.takeIf { it > 0 } ?: 0L),
                    durationMs = player?.duration?.takeIf { it > 0 } ?: 0L,
                    lastPlayedAt = System.currentTimeMillis(),
                )
            )
        }
    }

    fun savePosition() {
        val player = _player ?: return
        val q = queue.value ?: return
        val kind = q.kindOrdinal()
        if (kind == MediaKind.LIVE.ordinal) return
        val pos = player.currentPosition
        val dur = player.duration.takeIf { it > 0 } ?: 0L
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
        _player?.release()
        _player = null
        currentUrl = null
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            PlayerViewModel(container) as T
    }
}
