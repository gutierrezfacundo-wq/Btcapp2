package com.iptv.player.playback

import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.Episode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface PlaybackQueue {
    val title: String
    val streamUrl: String
    val logoUrl: String?

    data class Live(
        val channels: List<Channel>,
        val activeIndex: Int,
    ) : PlaybackQueue {
        val active: Channel get() = channels[activeIndex]
        override val title: String get() = active.name
        override val streamUrl: String get() = active.streamUrl
        override val logoUrl: String? get() = active.logoUrl
    }

    data class Episodes(
        val episodes: List<Episode>,
        val activeIndex: Int,
        val seriesTitle: String,
        val poster: String?,
    ) : PlaybackQueue {
        val active: Episode get() = episodes[activeIndex]
        override val title: String
            get() = "$seriesTitle — T${active.seasonNumber}E${active.episodeNumber} ${active.title}"
        override val streamUrl: String get() = active.streamUrl
        override val logoUrl: String? get() = poster
    }

    data class Single(
        val name: String,
        val url: String,
        val poster: String?,
    ) : PlaybackQueue {
        override val title: String get() = name
        override val streamUrl: String get() = url
        override val logoUrl: String? get() = poster
    }
}

class PlaybackController {

    private val _queue = MutableStateFlow<PlaybackQueue?>(null)
    val queue = _queue.asStateFlow()

    private val _playerVisible = MutableStateFlow(false)
    val playerVisible = _playerVisible.asStateFlow()

    fun setLive(channels: List<Channel>, activeIndex: Int) {
        if (channels.isEmpty()) return
        val idx = activeIndex.coerceIn(0, channels.size - 1)
        _queue.value = PlaybackQueue.Live(channels, idx)
    }

    fun setEpisodes(
        episodes: List<Episode>,
        activeIndex: Int,
        seriesTitle: String,
        poster: String?,
    ) {
        if (episodes.isEmpty()) return
        val idx = activeIndex.coerceIn(0, episodes.size - 1)
        _queue.value = PlaybackQueue.Episodes(episodes, idx, seriesTitle, poster)
    }

    fun setSingle(name: String, url: String, poster: String?) {
        _queue.value = PlaybackQueue.Single(name, url, poster)
    }

    fun clear() {
        _queue.value = null
    }

    fun selectIndex(index: Int) {
        when (val q = _queue.value) {
            is PlaybackQueue.Live -> if (index in q.channels.indices && index != q.activeIndex) {
                _queue.value = q.copy(activeIndex = index)
            }
            is PlaybackQueue.Episodes -> if (index in q.episodes.indices && index != q.activeIndex) {
                _queue.value = q.copy(activeIndex = index)
            }
            else -> Unit
        }
    }

    fun next() = step(1)
    fun previous() = step(-1)

    private fun step(delta: Int) {
        when (val q = _queue.value) {
            is PlaybackQueue.Live -> {
                if (q.channels.isEmpty()) return
                val n = (q.activeIndex + delta + q.channels.size) % q.channels.size
                _queue.value = q.copy(activeIndex = n)
            }
            is PlaybackQueue.Episodes -> {
                val n = q.activeIndex + delta
                if (n in q.episodes.indices) _queue.value = q.copy(activeIndex = n)
            }
            else -> Unit
        }
    }

    fun setPlayerVisible(visible: Boolean) {
        _playerVisible.value = visible
    }

    fun shouldAutoEnterPip(): Boolean = _playerVisible.value && _queue.value != null
}
