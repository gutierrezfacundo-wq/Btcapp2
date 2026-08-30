package com.iptv.player.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.iptv.player.data.model.EpgProgram
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun EpgBar(now: EpgProgram?, next: EpgProgram?, modifier: Modifier = Modifier) {
    if (now == null && next == null) return
    Column(
        modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        now?.let { p ->
            Text(
                "AHORA · ${formatRange(p)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                p.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            LinearProgressIndicator(
                progress = { progressOf(p) },
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
        }
        next?.let { p ->
            Spacer(Modifier.height(6.dp))
            Text(
                "DESPUÉS · ${formatTime(p.startEpochMs)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
            Text(
                p.title,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())

private fun formatTime(ms: Long): String = timeFmt.format(Date(ms))

private fun formatRange(p: EpgProgram): String =
    "${formatTime(p.startEpochMs)} - ${formatTime(p.stopEpochMs)}"

private fun progressOf(p: EpgProgram): Float {
    val total = (p.stopEpochMs - p.startEpochMs).coerceAtLeast(1L)
    val elapsed = (System.currentTimeMillis() - p.startEpochMs).coerceIn(0L, total)
    return elapsed.toFloat() / total.toFloat()
}
