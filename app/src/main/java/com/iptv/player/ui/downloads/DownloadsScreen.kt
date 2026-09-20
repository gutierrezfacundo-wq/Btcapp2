package com.iptv.player.ui.downloads

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.iptv.player.data.local.DownloadEntity
import com.iptv.player.data.local.DownloadStatus
import com.iptv.player.data.repository.formatBytes
import com.iptv.player.ui.components.DownloadProgressLine
import com.iptv.player.ui.home.HomeViewModel

/**
 * Lista de descargas: lo que está bajando y lo que ya se puede ver sin
 * internet. Tocar una descarga completa la reproduce desde el archivo local.
 */
@Composable
fun DownloadsTab(
    vm: HomeViewModel,
    onPlayLocal: (path: String, title: String) -> Unit,
) {
    val downloads by vm.downloads.collectAsState()
    val used = remember(downloads) { vm.downloadsUsedBytes() }
    val free = remember(downloads) { vm.downloadsFreeBytes() }

    if (downloads.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Outlined.Download,
                    contentDescription = null,
                    modifier = Modifier.size(48.dp),
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                )
                Text(
                    "Todavía no descargaste nada",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Text(
                    "Mantené apretada una película, o tocá el ícono de descarga en un episodio, " +
                        "para guardarlo y verlo sin internet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        Text(
            "${formatBytes(used)} usados · ${formatBytes(free)} libres en el teléfono",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
        )
        HorizontalDivider()
        LazyColumn {
            items(downloads, key = { it.id }) { d ->
                DownloadRow(
                    d = d,
                    onPlay = { onPlayLocal(d.localPath, d.title) },
                    onPause = { vm.pauseDownload(d.id) },
                    onResume = { vm.resumeDownload(d.id) },
                    onRemove = { vm.removeDownload(d.id) },
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun DownloadRow(
    d: DownloadEntity,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .then(if (d.isComplete) Modifier.clickable(onClick = onPlay) else Modifier)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(width = 54.dp, height = 78.dp)
                .clip(RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            // Preferimos la miniatura local: sin internet la remota no carga.
            val art = d.posterPath?.takeIf { java.io.File(it).exists() } ?: d.posterUrl
            if (!art.isNullOrBlank()) {
                AsyncImage(
                    model = art,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Box(Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)))
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                d.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (!d.subtitle.isNullOrBlank()) {
                Text(
                    d.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            if (d.isComplete) {
                Text(
                    "Lista para ver sin internet · ${formatBytes(d.bytesDownloaded)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 2.dp),
                )
            } else {
                DownloadProgressLine(d)
            }
        }
        when {
            d.isComplete -> IconButton(onClick = onPlay) {
                Icon(Icons.Outlined.PlayArrow, "Reproducir", tint = MaterialTheme.colorScheme.primary)
            }
            d.status == DownloadStatus.PAUSED || d.status == DownloadStatus.FAILED ->
                IconButton(onClick = onResume) { Icon(Icons.Outlined.Download, "Reanudar") }
            else -> IconButton(onClick = onPause) { Icon(Icons.Outlined.Pause, "Pausar") }
        }
        IconButton(onClick = onRemove) {
            Icon(Icons.Outlined.Delete, "Borrar", tint = MaterialTheme.colorScheme.error)
        }
    }
}
