package com.iptv.player.ui.downloads

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.iptv.player.ui.components.ConfirmDeleteDialog
import com.iptv.player.ui.components.DownloadProgressLine
import com.iptv.player.ui.home.HomeViewModel

/** Borrado pendiente de confirmación. */
private data class PendingDelete(
    val title: String,
    val message: String,
    val onConfirm: () -> Unit,
)

/** Una fila de la lista: una película suelta, o una serie con sus episodios. */
private sealed interface DownloadRowItem {
    data class Single(val d: DownloadEntity) : DownloadRowItem
    data class Series(
        val groupId: String,
        val title: String,
        val poster: String?,
        /** Episodios ordenados por temporada y número. */
        val episodes: List<DownloadEntity>,
    ) : DownloadRowItem {
        val totalBytes: Long get() = episodes.sumOf { it.bytesDownloaded }
        val ready: Int get() = episodes.count { it.isComplete }
    }
}

/** Agrupa episodios por serie; las películas quedan sueltas. */
private fun groupDownloads(all: List<DownloadEntity>): List<DownloadRowItem> {
    val (episodes, singles) = all.partition { !it.groupId.isNullOrBlank() }
    val series = episodes.groupBy { it.groupId!! }.map { (gid, eps) ->
        DownloadRowItem.Series(
            groupId = gid,
            title = eps.firstNotNullOfOrNull { it.groupTitle } ?: "Serie",
            poster = eps.firstNotNullOfOrNull { it.posterPath ?: it.posterUrl },
            episodes = eps.sortedWith(
                compareBy({ it.season ?: 0 }, { it.episode ?: 0 }, { it.title }),
            ),
        )
    }
    // Lo más reciente primero, mezclando películas y series.
    val singlesRows = singles.map { DownloadRowItem.Single(it) }
    return (singlesRows + series).sortedByDescending { row ->
        when (row) {
            is DownloadRowItem.Single -> row.d.createdAt
            is DownloadRowItem.Series -> row.episodes.maxOf { it.createdAt }
        }
    }
}

/**
 * Lista de descargas: lo que está bajando y lo que ya se puede ver sin
 * internet. Los episodios de una misma serie se agrupan bajo su carátula y se
 * ordenan por temporada.
 */
@Composable
fun DownloadsTab(
    vm: HomeViewModel,
    onPlayLocal: (path: String, title: String) -> Unit,
) {
    val downloads by vm.downloads.collectAsState()
    // Medir el disco es I/O: en el hilo de la UI trababa la pantalla.
    val space by androidx.compose.runtime.produceState(0L to 0L, downloads.size) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            vm.downloadsUsedBytes() to vm.downloadsFreeBytes()
        }
    }
    val (used, free) = space
    val rows = remember(downloads) { groupDownloads(downloads) }
    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    // Qué se está por borrar: se confirma antes, borrar no tiene vuelta atrás.
    var pendingDelete by remember { mutableStateOf<PendingDelete?>(null) }

    pendingDelete?.let { p ->
        ConfirmDeleteDialog(
            title = p.title,
            message = p.message,
            onConfirm = p.onConfirm,
            onDismiss = { pendingDelete = null },
        )
    }

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
        StorageHeader(vm = vm, used = used, free = free)
        HorizontalDivider()
        LazyColumn {
            items(
                rows,
                key = { r ->
                    when (r) {
                        is DownloadRowItem.Single -> "m:${r.d.id}"
                        is DownloadRowItem.Series -> "s:${r.groupId}"
                    }
                },
            ) { row ->
                val ctx = androidx.compose.ui.platform.LocalContext.current
                when (row) {
                    is DownloadRowItem.Single -> DownloadRow(
                        d = row.d,
                        onPlay = { onPlayLocal(row.d.localPath, row.d.title) },
                        onOpenWith = {
                            com.iptv.player.download.openWithExternalPlayer(ctx, row.d.localPath, row.d.title)
                        },
                        onPause = { vm.pauseDownload(row.d.id) },
                        onResume = { vm.resumeDownload(row.d.id) },
                        onRemove = {
                            pendingDelete = PendingDelete(
                                title = "¿Borrar la descarga?",
                                message = "Se va a borrar \"${row.d.title}\" del teléfono" +
                                    (if (row.d.bytesDownloaded > 0) " y se liberarán ${formatBytes(row.d.bytesDownloaded)}" else "") +
                                    ". Para verla de nuevo habrá que descargarla otra vez.",
                                onConfirm = { vm.removeDownload(row.d.id) },
                            )
                        },
                    )
                    is DownloadRowItem.Series -> SeriesGroup(
                        row = row,
                        expanded = expanded[row.groupId] == true,
                        onToggle = { expanded[row.groupId] = expanded[row.groupId] != true },
                        onPlay = { d -> onPlayLocal(d.localPath, "${row.title} — ${d.title}") },
                        onOpenWith = { d ->
                            com.iptv.player.download.openWithExternalPlayer(
                                ctx, d.localPath, "${row.title} — ${d.title}",
                            )
                        },
                        onPause = { d -> vm.pauseDownload(d.id) },
                        onResume = { d -> vm.resumeDownload(d.id) },
                        onRemove = { d ->
                            pendingDelete = PendingDelete(
                                title = "¿Borrar el episodio?",
                                message = "Se va a borrar \"${d.title}\"" +
                                    (d.season?.let { " (T$it" + (d.episode?.let { e -> " · E$e" } ?: "") + ")" } ?: "") +
                                    " del teléfono.",
                                onConfirm = { vm.removeDownload(d.id) },
                            )
                        },
                        onRemoveAll = {
                            pendingDelete = PendingDelete(
                                title = "¿Borrar toda la serie?",
                                message = "Se van a borrar los ${row.episodes.size} episodios " +
                                    "descargados de \"${row.title}\"" +
                                    (if (row.totalBytes > 0) " y se liberarán ${formatBytes(row.totalBytes)}" else "") + ".",
                                onConfirm = { row.episodes.forEach { vm.removeDownload(it.id) } },
                            )
                        },
                    )
                }
                HorizontalDivider()
            }
        }
    }
}

/**
 * Espacio usado/libre y, si hay tarjeta SD, dónde guardar lo que se descargue
 * de ahora en más. Lo ya descargado no se mueve: sigue donde está.
 */
@Composable
private fun StorageHeader(vm: HomeViewModel, used: Long, free: Long) {
    val volume by vm.downloadVolume.collectAsState()
    val targets = remember { vm.storageTargets() }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(
            "${formatBytes(used)} usados · ${formatBytes(free)} libres en el destino elegido",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
        if (targets.size > 1) {
            Row(
                modifier = Modifier.padding(top = 8.dp),
                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
            ) {
                targets.forEach { t ->
                    androidx.compose.material3.FilterChip(
                        selected = volume == t.id,
                        onClick = { vm.setDownloadVolume(t.id) },
                        label = { Text("${t.label} · ${formatBytes(t.freeBytes)} libres") },
                    )
                }
            }
            Text(
                "Las descargas nuevas van al destino elegido; las que ya bajaste no se mueven.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

/** Serie plegable: carátula + resumen, y adentro los episodios por temporada. */
@Composable
private fun SeriesGroup(
    row: DownloadRowItem.Series,
    expanded: Boolean,
    onToggle: () -> Unit,
    onPlay: (DownloadEntity) -> Unit,
    onOpenWith: (DownloadEntity) -> Unit,
    onPause: (DownloadEntity) -> Unit,
    onResume: (DownloadEntity) -> Unit,
    onRemove: (DownloadEntity) -> Unit,
    onRemoveAll: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Artwork(row.poster)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    row.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val seasons = row.episodes.mapNotNull { it.season }.distinct().size
                Text(
                    buildString {
                        append("${row.episodes.size} episodio${if (row.episodes.size == 1) "" else "s"}")
                        if (seasons > 1) append(" · $seasons temporadas")
                        if (row.totalBytes > 0) append(" · ${formatBytes(row.totalBytes)}")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                )
                if (row.ready < row.episodes.size) {
                    Text(
                        "${row.ready} de ${row.episodes.size} listos",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            IconButton(onClick = onRemoveAll) {
                Icon(Icons.Outlined.Delete, "Borrar toda la serie", tint = MaterialTheme.colorScheme.error)
            }
            Icon(
                if (expanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                contentDescription = if (expanded) "Contraer" else "Ver episodios",
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column {
                var lastSeason: Int? = null
                row.episodes.forEach { ep ->
                    if (ep.season != lastSeason) {
                        lastSeason = ep.season
                        Text(
                            ep.season?.let { "Temporada $it" } ?: "Episodios",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(start = 24.dp, top = 10.dp, bottom = 2.dp),
                        )
                    }
                    EpisodeRow(
                        d = ep,
                        onPlay = { onPlay(ep) },
                        onOpenWith = { onOpenWith(ep) },
                        onPause = { onPause(ep) },
                        onResume = { onResume(ep) },
                        onRemove = { onRemove(ep) },
                    )
                }
                Spacer(Modifier.size(8.dp))
            }
        }
    }
}

@Composable
private fun EpisodeRow(
    d: DownloadEntity,
    onPlay: () -> Unit,
    onOpenWith: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .then(if (d.isComplete) Modifier.clickable(onClick = onPlay) else Modifier)
            .padding(start = 24.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            d.episode?.let { "E${it.toString().padStart(2, '0')}" } ?: "—",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            modifier = Modifier.width(38.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(
                d.title,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!d.isComplete) DownloadProgressLine(d)
        }
        if (d.isComplete) {
            IconButton(onClick = onPlay) {
                Icon(Icons.Outlined.PlayArrow, "Reproducir", tint = MaterialTheme.colorScheme.primary)
            }
            IconButton(onClick = onOpenWith) {
                Icon(Icons.Outlined.OpenInNew, "Abrir con otro reproductor")
            }
        } else if (d.status == DownloadStatus.PAUSED || d.status == DownloadStatus.FAILED) {
            IconButton(onClick = onResume) { Icon(Icons.Outlined.Download, "Reanudar") }
        } else {
            IconButton(onClick = onPause) { Icon(Icons.Outlined.Pause, "Pausar") }
        }
        IconButton(onClick = onRemove) {
            Icon(Icons.Outlined.Delete, "Borrar", tint = MaterialTheme.colorScheme.error)
        }
    }
}

/** Carátula local si existe (sirve sin internet); si no, la remota. */
@Composable
private fun Artwork(art: String?) {
    Box(
        modifier = Modifier.size(width = 54.dp, height = 78.dp).clip(RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) {
        val model = art?.takeIf { !it.startsWith("/") || java.io.File(it).exists() }
        if (!model.isNullOrBlank()) {
            AsyncImage(
                model = model,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun DownloadRow(
    d: DownloadEntity,
    onPlay: () -> Unit,
    onOpenWith: () -> Unit,
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
        Artwork(d.posterPath ?: d.posterUrl)
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
            d.isComplete -> {
                IconButton(onClick = onPlay) {
                    Icon(Icons.Outlined.PlayArrow, "Reproducir", tint = MaterialTheme.colorScheme.primary)
                }
                IconButton(onClick = onOpenWith) {
                    Icon(Icons.Outlined.OpenInNew, "Abrir con otro reproductor")
                }
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
