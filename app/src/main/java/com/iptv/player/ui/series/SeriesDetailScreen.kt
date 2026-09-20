package com.iptv.player.ui.series

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.iptv.player.data.local.DownloadStatus
import com.iptv.player.data.model.Episode
import com.iptv.player.di.AppContainer
import com.iptv.player.ui.components.DownloadProgressLine
import com.iptv.player.ui.components.EpisodeDownloadIcon
import com.iptv.player.ui.home.HomeViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeriesDetailScreen(
    container: AppContainer,
    seriesId: String,
    title: String,
    onPlay: (url: String, title: String) -> Unit,
    onBack: () -> Unit,
) {
    val vm: HomeViewModel = viewModel(factory = HomeViewModel.Factory(container))
    var episodes by remember { mutableStateOf<List<Episode>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var retryKey by remember { mutableStateOf(0) }
    val downloadsById by vm.downloadsById.collectAsState()

    LaunchedEffect(seriesId, retryKey) {
        error = null
        episodes = null
        runCatching { vm.seriesEpisodes(seriesId) }
            .onSuccess { episodes = it }
            .onFailure { error = it.message ?: "No se pudieron cargar los episodios" }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                error != null -> Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(error!!, color = MaterialTheme.colorScheme.error)
                    Button(
                        onClick = { retryKey++ },
                        modifier = Modifier.padding(top = 16.dp),
                    ) { Text("Reintentar") }
                }
                episodes == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                episodes!!.isEmpty() -> Text(
                    "Sin episodios",
                    modifier = Modifier.padding(16.dp),
                )
                else -> {
                    val eps = episodes!!
                    LazyColumn {
                        items(eps, key = { it.id }) { ep ->
                            val dl = downloadsById[ep.id]
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f)
                                        .clickable {
                                            // Si está descargado, se reproduce del archivo local.
                                            val local = dl?.takeIf { it.isComplete }?.localPath
                                            if (local != null) {
                                                vm.playSingle(ep.title, local, null)
                                                onPlay(local, "T${ep.seasonNumber} E${ep.episodeNumber} — ${ep.title}")
                                            } else {
                                                val idx = eps.indexOf(ep)
                                                container.playbackController.setEpisodes(
                                                    episodes = eps,
                                                    activeIndex = idx,
                                                    seriesTitle = title,
                                                    poster = null,
                                                )
                                                onPlay(ep.streamUrl, "T${ep.seasonNumber} E${ep.episodeNumber} — ${ep.title}")
                                            }
                                        }
                                        .padding(16.dp),
                                ) {
                                    Text(
                                        "T${ep.seasonNumber} · E${ep.episodeNumber}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                    Text(ep.title, style = MaterialTheme.typography.bodyLarge)
                                    if (dl != null && !dl.isComplete) DownloadProgressLine(dl)
                                    else if (dl != null) Text(
                                        "Descargado · se ve sin internet",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        when (dl?.status) {
                                            null -> vm.downloadEpisode(ep, title, null)
                                            DownloadStatus.DONE -> vm.removeDownload(ep.id)
                                            DownloadStatus.PAUSED, DownloadStatus.FAILED -> vm.resumeDownload(ep.id)
                                            else -> vm.pauseDownload(ep.id)
                                        }
                                    },
                                    modifier = Modifier.padding(end = 8.dp),
                                ) {
                                    EpisodeDownloadIcon(dl)
                                }
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}
