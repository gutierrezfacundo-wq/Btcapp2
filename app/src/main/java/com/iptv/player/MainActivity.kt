package com.iptv.player

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
        setContent {
            IptvTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val source = container.preferencesStore.source.collectAsState(initial = null)
                    val navController = rememberNavController()
                    val pip by isInPipMode.collectAsState()
                    CompositionLocalProvider(
                        LocalIsInPipMode provides pip,
                        LocalEnterPip provides ::enterPip,
                    ) {
                        AppNavGraph(
                            navController = navController,
                            container = container,
                            hasSource = source.value != null,
                        )
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
