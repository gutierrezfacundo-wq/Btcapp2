package com.iptv.player.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.EpgProgram
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val DP_PER_MIN = 4
private val CHANNEL_COL_WIDTH = 96.dp
private val ROW_HEIGHT = 64.dp
private const val PAST_HOURS = 4
private const val FUTURE_HOURS = 8
private val SLOT_MINUTES = 30

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EpgGuide(
    channels: List<Channel>,
    epg: Map<String, List<EpgProgram>>,
    onPlayChannel: (index: Int) -> Unit,
    onBack: () -> Unit,
    epgIdOf: (Channel) -> String? = { it.tvgId },
    onPlayCatchup: ((channel: Channel, program: EpgProgram) -> Unit)? = null,
) {
    val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    val now = remember { System.currentTimeMillis() }
    val windowStart = remember(now) { floorToHour(now) - PAST_HOURS * 3_600_000L }
    val windowEnd = windowStart + (PAST_HOURS + FUTURE_HOURS) * 3_600_000L
    val totalMinutes = ((windowEnd - windowStart) / 60_000L).toInt()
    val totalWidth = (totalMinutes * DP_PER_MIN).dp
    val density = androidx.compose.ui.platform.LocalDensity.current

    val hScroll = rememberScrollState()
    val listState = rememberLazyListState()
    var selected by remember { mutableStateOf<EpgProgram?>(null) }
    var selectedIndex by remember { mutableStateOf(-1) }
    var selectedChannel by remember { mutableStateOf<Channel?>(null) }

    // Arrancar el scroll en "ahora" (con 30 min de contexto previo).
    androidx.compose.runtime.LaunchedEffect(Unit) {
        val nowMinutes = ((now - windowStart) / 60_000L).toInt() - 30
        val px = with(density) { (nowMinutes.coerceAtLeast(0) * DP_PER_MIN).dp.toPx() }
        hScroll.scrollTo(px.toInt())
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Guía de programación") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Time header row
            Row(modifier = Modifier.fillMaxWidth().height(36.dp)) {
                Box(
                    modifier = Modifier
                        .width(CHANNEL_COL_WIDTH)
                        .fillMaxHeight()
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "Canal",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .horizontalScroll(hScroll)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    Row(
                        modifier = Modifier.width(totalWidth).fillMaxHeight(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val slots = totalMinutes / SLOT_MINUTES
                        repeat(slots) { i ->
                            val slotTime = windowStart + i.toLong() * SLOT_MINUTES * 60_000L
                            Text(
                                timeFormat.format(Date(slotTime)),
                                modifier = Modifier.width((SLOT_MINUTES * DP_PER_MIN).dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
                            )
                        }
                    }
                }
            }
            HorizontalDivider()

            LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                itemsIndexed(channels, key = { _, ch -> ch.id }) { index, ch ->
                    GuideRow(
                        channel = ch,
                        programs = epg[epgIdOf(ch)].orEmpty(),
                        windowStart = windowStart,
                        windowEnd = windowEnd,
                        totalWidth = totalWidth,
                        now = now,
                        hScroll = hScroll,
                        timeFormat = timeFormat,
                        onPlay = { onPlayChannel(index) },
                        onProgramClick = { prog ->
                            if (now in prog.startEpochMs..prog.stopEpochMs) {
                                onPlayChannel(index)
                            } else {
                                selected = prog
                                selectedIndex = index
                                selectedChannel = ch
                            }
                        },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                }
            }
        }
    }

    val sel = selected
    if (sel != null) {
        val selCh = selectedChannel
        val isPast = sel.stopEpochMs < now
        val withinArchive = selCh != null && selCh.archiveDays > 0 &&
            sel.startEpochMs >= now - selCh.archiveDays * 86_400_000L
        val canCatchup = isPast && withinArchive && onPlayCatchup != null && selCh != null
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text(sel.title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
            text = {
                Column {
                    Text(
                        "${timeFormat.format(Date(sel.startEpochMs))} - " +
                            timeFormat.format(Date(sel.stopEpochMs)),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    if (!sel.description.isNullOrBlank()) {
                        Spacer(Modifier.size(8.dp))
                        Text(sel.description, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (isPast && !canCatchup) {
                        Spacer(Modifier.size(8.dp))
                        Text(
                            "Este programa ya se emitió y el proveedor no ofrece catch-up para este canal.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                }
            },
            confirmButton = {
                if (canCatchup) {
                    TextButton(onClick = {
                        val ch = selCh
                        val prog = sel
                        selected = null
                        if (ch != null) onPlayCatchup?.invoke(ch, prog)
                    }) { Text("▶ Ver programa") }
                } else {
                    TextButton(onClick = {
                        val idx = selectedIndex
                        selected = null
                        if (idx >= 0) onPlayChannel(idx)
                    }) { Text("Ver canal") }
                }
            },
            dismissButton = {
                TextButton(onClick = { selected = null }) { Text("Cerrar") }
            },
        )
    }
}

@Composable
private fun GuideRow(
    channel: Channel,
    programs: List<EpgProgram>,
    windowStart: Long,
    windowEnd: Long,
    totalWidth: androidx.compose.ui.unit.Dp,
    now: Long,
    hScroll: androidx.compose.foundation.ScrollState,
    timeFormat: SimpleDateFormat,
    onPlay: () -> Unit,
    onProgramClick: (EpgProgram) -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth().height(ROW_HEIGHT)) {
        // Fixed channel cell
        Row(
            modifier = Modifier
                .width(CHANNEL_COL_WIDTH)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.surface)
                .clickable(onClick = onPlay)
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xFF222226)),
                contentAlignment = Alignment.Center,
            ) {
                if (!channel.logoUrl.isNullOrBlank()) {
                    AsyncImage(model = channel.logoUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(Icons.Outlined.LiveTv, null, tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.size(4.dp))
            Text(
                channel.name,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // Scrollable program lane: outer viewport (weight) + fixed-width canvas
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .horizontalScroll(hScroll),
        ) {
            Box(modifier = Modifier.width(totalWidth).fillMaxHeight()) {
                val visible = programs.filter { it.stopEpochMs > windowStart && it.startEpochMs < windowEnd }
                if (visible.isEmpty()) {
                    Text(
                        "  Sin información",
                        modifier = Modifier.align(Alignment.CenterStart),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                    )
                }
                visible.forEach { prog ->
                    val startMin = ((prog.startEpochMs.coerceAtLeast(windowStart) - windowStart) / 60_000L).toInt()
                    val endMin = ((prog.stopEpochMs.coerceAtMost(windowEnd) - windowStart) / 60_000L).toInt()
                    val widthMin = (endMin - startMin).coerceAtLeast(1)
                    val isLive = now in prog.startEpochMs..prog.stopEpochMs
                    ProgramCell(
                        program = prog,
                        isLive = isLive,
                        offsetX = (startMin * DP_PER_MIN).dp,
                        cellWidth = (widthMin * DP_PER_MIN).dp,
                        timeFormat = timeFormat,
                        onClick = { onProgramClick(prog) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ProgramCell(
    program: EpgProgram,
    isLive: Boolean,
    offsetX: androidx.compose.ui.unit.Dp,
    cellWidth: androidx.compose.ui.unit.Dp,
    timeFormat: SimpleDateFormat,
    onClick: () -> Unit,
) {
    val bg = if (isLive) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
        else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
    Box(
        modifier = Modifier
            .offset(x = offsetX)
            .width(cellWidth)
            .fillMaxHeight()
            .padding(1.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(bg)
            .then(
                if (isLive) Modifier.border(
                    1.dp,
                    MaterialTheme.colorScheme.primary,
                    RoundedCornerShape(4.dp),
                ) else Modifier
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 4.dp),
    ) {
        Column(verticalArrangement = Arrangement.Center, modifier = Modifier.fillMaxHeight()) {
            Text(
                program.title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (isLive) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                timeFormat.format(Date(program.startEpochMs)),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                maxLines = 1,
            )
        }
    }
}

private fun floorToHour(epochMs: Long): Long = epochMs - (epochMs % 3_600_000L)
