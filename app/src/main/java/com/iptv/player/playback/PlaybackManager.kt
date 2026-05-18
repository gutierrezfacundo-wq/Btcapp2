package com.iptv.player.playback

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import okhttp3.OkHttpClient

@UnstableApi
class PlaybackManager(
    private val appContext: Context,
    private val httpClient: OkHttpClient,
) {

    private var _player: ExoPlayer? = null
    private var currentUrl: String? = null

    val player: ExoPlayer
        get() = _player ?: createPlayer().also { _player = it }

    private fun createPlayer(): ExoPlayer {
        val httpFactory = OkHttpDataSource.Factory(httpClient)
        val dataSourceFactory = DefaultDataSource.Factory(appContext, httpFactory)
        return ExoPlayer.Builder(appContext)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .build()
    }

    fun play(url: String, startPositionMs: Long = 0L) {
        if (url == currentUrl) {
            _player?.playWhenReady = true
            return
        }
        currentUrl = url
        val p = player
        p.setMediaItem(MediaItem.fromUri(url))
        p.prepare()
        if (startPositionMs > 0L) p.seekTo(startPositionMs)
        p.playWhenReady = true
    }

    fun pause() { _player?.pause() }
    fun stop() {
        _player?.stop()
        _player?.clearMediaItems()
        currentUrl = null
    }

    val currentPosition: Long get() = _player?.currentPosition ?: 0L
    val duration: Long get() = _player?.duration?.takeIf { it > 0 } ?: 0L
    val isPlaying: Boolean get() = _player?.isPlaying == true

    fun release() {
        _player?.release()
        _player = null
        currentUrl = null
    }
}
