package com.iptv.player.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Opciones de idioma: el valor es el código ISO que entiende el reproductor. */
private val AUDIO_OPTIONS = listOf(
    "" to "El que venga",
    "spa" to "Español",
    "eng" to "Inglés",
    "por" to "Portugués",
)

private val SUB_OPTIONS = listOf(
    "" to "Automático",
    "off" to "Sin subtítulos",
    "spa" to "Español",
    "eng" to "Inglés",
)

/**
 * Idioma preferido de audio y subtítulos. Se aplica al reproducir, tanto en
 * streams como en descargas: el archivo trae todas sus pistas y elegimos cuál
 * suena por defecto.
 */
@Composable
fun LanguageSettingsDialog(
    audioLang: String,
    subLang: String,
    onAudioLang: (String) -> Unit,
    onSubLang: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Idioma preferido") },
        text = {
            Column {
                Text("Audio", style = MaterialTheme.typography.labelLarge)
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AUDIO_OPTIONS.forEach { (code, label) ->
                        FilterChip(
                            selected = audioLang == code,
                            onClick = { onAudioLang(code) },
                            label = { Text(label) },
                        )
                    }
                }
                Text(
                    "Subtítulos",
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SUB_OPTIONS.forEach { (code, label) ->
                        FilterChip(
                            selected = subLang == code,
                            onClick = { onSubLang(code) },
                            label = { Text(label) },
                        )
                    }
                }
                Text(
                    "Se aplica cuando el contenido trae esa pista; si no, queda la que venga " +
                        "y podés cambiarla desde el reproductor.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Listo") } },
    )
}
