package com.iptv.player

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.iptv.player.ui.AppNavGraph
import com.iptv.player.ui.theme.IptvTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as IptvApp).container
        setContent {
            IptvTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val source = container.preferencesStore.source.collectAsState(initial = null)
                    val navController = rememberNavController()
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
