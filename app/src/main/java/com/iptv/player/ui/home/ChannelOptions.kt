package com.iptv.player.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChildCare
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.PlaylistAdd
import androidx.compose.material.icons.outlined.Tag
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.iptv.player.data.model.Channel

private enum class OptionView { Menu, Rename, Number, EpgPicker }

@Composable
fun ChannelOptionsDialog(
    channel: Channel,
    currentCustomName: String?,
    currentNumber: Int?,
    currentEpgId: String?,
    availableEpgIds: List<String>,
    onAddToCollection: () -> Unit,
    onRename: (String?) -> Unit,
    onSetNumber: (Int?) -> Unit,
    onHide: () -> Unit,
    onSetEpg: (String?) -> Unit,
    onDismiss: () -> Unit,
    /** Abre el diálogo "Apto para Felix" (null oculta la opción). */
    onKidsMark: (() -> Unit)? = null,
) {
    var view by remember { mutableStateOf(OptionView.Menu) }

    when (view) {
        OptionView.Menu -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(channel.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            text = {
                Column {
                    OptionRow(Icons.Outlined.PlaylistAdd, "Agregar a colección") {
                        onAddToCollection()
                    }
                    OptionRow(Icons.Outlined.Edit, "Renombrar") { view = OptionView.Rename }
                    OptionRow(Icons.Outlined.Tag, buildString {
                        append("Asignar número")
                        if (currentNumber != null) append(" (actual: $currentNumber)")
                    }) { view = OptionView.Number }
                    OptionRow(Icons.Outlined.LiveTv, buildString {
                        append("Asignar guía EPG")
                        if (currentEpgId != null) append(" (actual: $currentEpgId)")
                    }) { view = OptionView.EpgPicker }
                    OptionRow(Icons.Outlined.VisibilityOff, "Ocultar canal") {
                        onHide()
                        onDismiss()
                    }
                    if (onKidsMark != null) {
                        OptionRow(Icons.Outlined.ChildCare, "Apto para Felix…") {
                            onKidsMark()
                            onDismiss()
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = onDismiss) { Text("Cerrar") }
            },
        )

        OptionView.Rename -> {
            var text by remember { mutableStateOf(currentCustomName ?: channel.name) }
            AlertDialog(
                onDismissRequest = onDismiss,
                title = { Text("Renombrar canal") },
                text = {
                    OutlinedTextField(
                        value = text, onValueChange = { text = it }, singleLine = true,
                        label = { Text("Nombre") },
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        onRename(text.trim())
                        onDismiss()
                    }) { Text("Guardar") }
                },
                dismissButton = {
                    Row {
                        if (currentCustomName != null) {
                            TextButton(onClick = {
                                onRename(null)
                                onDismiss()
                            }) { Text("Restaurar original") }
                        }
                        TextButton(onClick = onDismiss) { Text("Cancelar") }
                    }
                },
            )
        }

        OptionView.Number -> {
            var text by remember { mutableStateOf(currentNumber?.toString() ?: "") }
            AlertDialog(
                onDismissRequest = onDismiss,
                title = { Text("Número de canal") },
                text = {
                    Column {
                        Text(
                            "Los canales con número aparecen primero, ordenados.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                        Spacer(Modifier.padding(4.dp))
                        OutlinedTextField(
                            value = text,
                            onValueChange = { text = it.filter { c -> c.isDigit() }.take(5) },
                            singleLine = true,
                            label = { Text("Número") },
                        )
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        onSetNumber(text.toIntOrNull())
                        onDismiss()
                    }) { Text("Guardar") }
                },
                dismissButton = {
                    TextButton(onClick = onDismiss) { Text("Cancelar") }
                },
            )
        }

        OptionView.EpgPicker -> {
            var query by remember { mutableStateOf("") }
            val filtered = remember(query, availableEpgIds) {
                if (query.isBlank()) availableEpgIds
                else availableEpgIds.filter { it.contains(query, ignoreCase = true) }
            }
            AlertDialog(
                onDismissRequest = onDismiss,
                title = { Text("Asignar guía EPG") },
                text = {
                    Column {
                        if (availableEpgIds.isEmpty()) {
                            Text(
                                "La guía todavía no cargó o la fuente no tiene EPG.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        } else {
                            OutlinedTextField(
                                value = query, onValueChange = { query = it }, singleLine = true,
                                label = { Text("Buscar id de guía…") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            LazyColumn(modifier = Modifier.heightIn(max = 280.dp)) {
                                items(filtered) { id ->
                                    Text(
                                        id,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                onSetEpg(id)
                                                onDismiss()
                                            }
                                            .padding(vertical = 10.dp, horizontal = 4.dp),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        color = if (id == currentEpgId) MaterialTheme.colorScheme.primary
                                            else MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    if (currentEpgId != null) {
                        TextButton(onClick = {
                            onSetEpg(null)
                            onDismiss()
                        }) { Text("Quitar mapeo") }
                    }
                },
                dismissButton = {
                    TextButton(onClick = onDismiss) { Text("Cancelar") }
                },
            )
        }
    }
}

@Composable
private fun OptionRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun HiddenItemsDialog(
    hiddenChannels: List<Channel>,
    hiddenCategories: List<String>,
    onUnhideChannel: (String) -> Unit,
    onUnhideCategory: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ocultos") },
        text = {
            if (hiddenChannels.isEmpty() && hiddenCategories.isEmpty()) {
                Text("No hay canales ni categorías ocultas.")
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 360.dp)) {
                    if (hiddenCategories.isNotEmpty()) {
                        item {
                            Text(
                                "Categorías",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                        items(hiddenCategories) { cat ->
                            HiddenRow(cat) { onUnhideCategory(cat) }
                        }
                    }
                    if (hiddenChannels.isNotEmpty()) {
                        item {
                            Text(
                                "Canales",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }
                        items(hiddenChannels, key = { it.id }) { ch ->
                            HiddenRow(ch.name) { onUnhideChannel(ch.id) }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cerrar") }
        },
    )
}

@Composable
private fun HiddenRow(label: String, onShow: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        TextButton(onClick = onShow) { Text("Mostrar") }
    }
}
