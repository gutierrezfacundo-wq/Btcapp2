package com.iptv.player

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.iptv.player.ui.AppNavGraph
import com.iptv.player.ui.LocalEnterPip
import com.iptv.player.ui.LocalIsInPipMode
import com.iptv.player.ui.theme.IptvTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {

    private val isInPipMode = MutableStateFlow(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as IptvApp).container
        val lastCrash = com.iptv.player.crash.CrashStore.consume(this)
        setContent {
            IptvTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    // null = cargando (corre migracion legacy y lee playlists);
                    // true = hay listas -> Home; false = no hay -> Setup.
                    val hasPlaylists by produceState<Boolean?>(initialValue = null) {
                        container.playlistRepository.migrateLegacyIfNeeded()
                        container.playlistRepository.playlists.collect { list ->
                            value = list.isNotEmpty()
                        }
                    }
                    val pip by isInPipMode.collectAsState()
                    CompositionLocalProvider(
                        LocalIsInPipMode provides pip,
                        LocalEnterPip provides ::enterPip,
                    ) {
                        when (val ready = hasPlaylists) {
                            null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                            else -> {
                                val navController = rememberNavController()
                                AppNavGraph(
                                    navController = navController,
                                    container = container,
                                    hasSource = ready,
                                )
                            }
                        }
                    }
                    if (lastCrash != null) {
                        com.iptv.player.ui.CrashDialog(trace = lastCrash)
                    }
                }
            }
        }
    }

    private fun enterPip() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        runCatching {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .build()
            enterPictureInPictureMode(params)
        }
    }

    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        val controller = (application as IptvApp).container.playbackController
        if (controller.playerVisible.value) {
            when (keyCode) {
                android.view.KeyEvent.KEYCODE_CHANNEL_UP,
                android.view.KeyEvent.KEYCODE_MEDIA_NEXT,
                -> {
                    controller.next()
                    return true
                }
                android.view.KeyEvent.KEYCODE_CHANNEL_DOWN,
                android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS,
                -> {
                    controller.previous()
                    return true
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        val container = (application as IptvApp).container
        if (container.playbackController.shouldAutoEnterPip()) {
            enterPip()
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        isInPipMode.value = isInPictureInPictureMode
    }
}
