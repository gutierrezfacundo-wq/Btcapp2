package com.iptv.player.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFF4081),
    onPrimary = Color.White,
    secondary = Color(0xFF7C4DFF),
    background = Color(0xFF0E0E10),
    surface = Color(0xFF18181B),
    onSurface = Color(0xFFE5E7EB),
    onBackground = Color(0xFFE5E7EB),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFFE91E63),
    secondary = Color(0xFF673AB7),
)

@Composable
fun IptvTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
