package com.iptv.player.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Paleta dark IPTV: fondo casi negro, surface gris muy oscuro, acento cian (lectura suave de noche).
private val DarkColors = darkColorScheme(
    primary = Color(0xFF4FC3F7),
    onPrimary = Color(0xFF001E2C),
    primaryContainer = Color(0xFF003A52),
    onPrimaryContainer = Color(0xFFCFE7FF),
    secondary = Color(0xFFFFB74D),
    onSecondary = Color(0xFF2E1A00),
    tertiary = Color(0xFFEF5350),
    background = Color(0xFF0B0B0E),
    onBackground = Color(0xFFE7E9EE),
    surface = Color(0xFF14141A),
    onSurface = Color(0xFFE7E9EE),
    surfaceVariant = Color(0xFF1F1F27),
    onSurfaceVariant = Color(0xFFB9BCC4),
    outline = Color(0xFF3A3A45),
    error = Color(0xFFFF6E6E),
)

@Composable
fun IptvTheme(content: @Composable () -> Unit) {
    // Forzamos tema oscuro: la app se usa para mirar TV en cualquier hora.
    MaterialTheme(colorScheme = DarkColors, content = content)
}
