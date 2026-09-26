package com.iptv.player.ui.player

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.TrackGroup
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer

@OptIn(ExperimentalMaterial3Api::class, UnstableApi::class)
@Composable
fun TrackSelectorSheet(player: ExoPlayer, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val tracks by produceState(initialValue = player.currentTracks, player) {
        val listener = object : androidx.media3.common.Player.Listener {
            override fun onTracksChanged(newTracks: Tracks) {
                value = newTracks
            }
        }
        player.addListener(listener)
        awaitDispose { player.removeListener(listener) }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TrackSection("Video", tracks, C.TRACK_TYPE_VIDEO, player)
            TrackSection("Audio", tracks, C.TRACK_TYPE_AUDIO, player)
            TrackSection("Subtítulos", tracks, C.TRACK_TYPE_TEXT, player)
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun TrackSection(label: String, tracks: Tracks, type: Int, player: ExoPlayer) {
    val groups = tracks.groups.filter { it.type == type }
    if (groups.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        groups.forEach { group ->
            for (i in 0 until group.length) {
                val format = group.getTrackFormat(i)
                val isSelected = group.isTrackSelected(i)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = isSelected,
                            onClick = { selectTrack(player, group.mediaTrackGroup, i, type) },
                        )
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        tint = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                    )
                    Text(formatLabel(format, type), Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

@OptIn(UnstableApi::class)
private fun selectTrack(player: ExoPlayer, group: TrackGroup, trackIndex: Int, type: Int) {
    val params = player.trackSelectionParameters
        .buildUpon()
        .clearOverridesOfType(type)
        .setOverrideForType(TrackSelectionOverride(group, trackIndex))
        .build()
    player.trackSelectionParameters = params
}

private fun formatLabel(format: Format, type: Int): String = when (type) {
    C.TRACK_TYPE_VIDEO -> buildString {
        if (format.height > 0) append("${format.height}p")
        if (format.bitrate > 0) {
            if (isNotEmpty()) append(" · ")
            append("${format.bitrate / 1000} kbps")
        }
        if (isEmpty()) append(format.label ?: format.id ?: "Video")
    }
    C.TRACK_TYPE_AUDIO -> buildString {
        append(format.label ?: format.language ?: "Audio")
        if (format.channelCount > 0) append(" · ${format.channelCount} ch")
    }
    C.TRACK_TYPE_TEXT -> format.label ?: format.language ?: "Subtítulo"
    else -> format.id ?: "Pista"
}
