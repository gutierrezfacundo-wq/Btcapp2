package com.iptv.player.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

@Composable
fun CrashDialog(trace: String) {
    var open by remember { mutableStateOf(true) }
    val context = LocalContext.current
    if (!open) return
    AlertDialog(
        onDismissRequest = { open = false },
        title = { Text("La app se cerró por un error") },
        text = {
            Text(
                trace,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState()),
            )
        },
        confirmButton = {
            TextButton(onClick = {
                copyToClipboard(context, trace)
                Toast.makeText(context, "Error copiado", Toast.LENGTH_SHORT).show()
                open = false
            }) { Text("Copiar") }
        },
        dismissButton = {
            TextButton(onClick = { open = false }) { Text("Cerrar") }
        },
    )
}

private fun copyToClipboard(context: Context, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    cm?.setPrimaryClip(ClipData.newPlainText("crash", text))
}
