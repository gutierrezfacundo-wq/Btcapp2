package com.iptv.player.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChildCare
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.DownloadDone
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.iptv.player.data.local.DownloadEntity
import com.iptv.player.data.local.DownloadStatus
import com.iptv.player.data.model.LanguageVariants
import com.iptv.player.data.model.Movie
import com.iptv.player.data.repository.formatBytes

/** Fila de acción de los diálogos (ícono + texto). */
@Composable
private fun OptionRow(icon: ImageVector, text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(16.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

/**
 * Opciones de una película: descargar/gestionar la descarga y marcarla apta
 * para el modo Felix.
 */
@Composable
fun MovieOptionsDialog(
    title: String,
    download: DownloadEntity?,
    kidsEnabled: Boolean,
    /** Otras versiones de idioma del mismo título en el catálogo. */
    languageVariants: List<Movie> = emptyList(),
    onDownloadVariant: (Movie) -> Unit = {},
    onOpenWith: () -> Unit = {},
    onShare: () -> Unit = {},
    onDownload: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onRemoveDownload: () -> Unit,
    onPlayLocal: () -> Unit,
    onKidsMark: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, maxLines = 2) },
        text = {
            Column {
                if (download == null) {
                    OptionRow(Icons.Outlined.Download, "Descargar para ver sin internet") {
                        onDownload(); onDismiss()
                    }
                    // El archivo se baja entero con todas sus pistas: "elegir
                    // idioma" es elegir cuál de las versiones del proveedor.
                    if (languageVariants.size > 1) {
                        Text(
                            "Otras versiones disponibles",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(top = 10.dp),
                        )
                        languageVariants.forEach { v ->
                            val label = LanguageVariants.labelOf(v.name) ?: v.name
                            OptionRow(Icons.Outlined.Translate, "Descargar en $label") {
                                onDownloadVariant(v); onDismiss()
                            }
                        }
                    }
                } else when (download.status) {
                    DownloadStatus.DONE -> {
                        OptionRow(Icons.Outlined.PlayArrow, "Reproducir descarga") { onPlayLocal(); onDismiss() }
                        OptionRow(Icons.Outlined.OpenInNew, "Abrir con otro reproductor") { onOpenWith(); onDismiss() }
                        OptionRow(Icons.Outlined.Share, "Compartir archivo") { onShare(); onDismiss() }
                        OptionRow(Icons.Outlined.Delete, "Borrar descarga (${formatBytes(download.bytesDownloaded)})") {
                            onRemoveDownload(); onDismiss()
                        }
                    }
                    DownloadStatus.RUNNING, DownloadStatus.QUEUED -> {
                        DownloadProgressLine(download)
                        OptionRow(Icons.Outlined.Pause, "Pausar descarga") { onPause(); onDismiss() }
                        OptionRow(Icons.Outlined.Delete, "Cancelar descarga") { onRemoveDownload(); onDismiss() }
                    }
                    else -> {
                        // Pausada o fallida
                        download.error?.let {
                            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                        DownloadProgressLine(download)
                        OptionRow(Icons.Outlined.Download, "Reanudar descarga") { onResume(); onDismiss() }
                        OptionRow(Icons.Outlined.Delete, "Borrar descarga") { onRemoveDownload(); onDismiss() }
                    }
                }
                if (kidsEnabled) {
                    OptionRow(Icons.Outlined.ChildCare, "Apto para Felix…") { onKidsMark(); onDismiss() }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cerrar") } },
    )
}

/** Barra + bytes de una descarga en curso. */
@Composable
fun DownloadProgressLine(d: DownloadEntity, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        val p = d.progress
        if (p != null) {
            LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth())
        } else {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        Text(
            buildString {
                append(
                    when (d.status) {
                        DownloadStatus.QUEUED -> "En cola"
                        DownloadStatus.RUNNING -> "Descargando"
                        DownloadStatus.PAUSED -> "Pausada"
                        DownloadStatus.FAILED -> "Falló"
                        else -> "Lista"
                    }
                )
                append(" · ${formatBytes(d.bytesDownloaded)}")
                if (d.bytesTotal > 0) append(" de ${formatBytes(d.bytesTotal)}")
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** Ícono de estado para la fila de un episodio. */
@Composable
fun EpisodeDownloadIcon(download: DownloadEntity?) {
    when (download?.status) {
        null -> Icon(Icons.Outlined.Download, "Descargar", tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f))
        DownloadStatus.DONE -> Icon(Icons.Outlined.DownloadDone, "Descargado", tint = MaterialTheme.colorScheme.primary)
        DownloadStatus.PAUSED, DownloadStatus.FAILED ->
            Icon(Icons.Outlined.Pause, "Pausada", tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        else -> Icon(Icons.Outlined.Download, "En curso", tint = MaterialTheme.colorScheme.primary)
    }
}
