package com.iptv.player.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth

/**
 * Diálogo de PIN parental (modo Felix).
 * mode "set": pide el PIN dos veces para crearlo. mode "verify": lo compara.
 */
@Composable
fun PinDialog(
    mode: String, // "set" | "verify"
    expected: String = "",
    title: String,
    onSuccess: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var pin by remember { mutableStateOf("") }
    var first by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        val p = pin.trim()
        if (p.length != 4) { error = "El PIN debe tener 4 números"; return }
        if (mode == "verify") {
            if (p == expected) onSuccess(p) else { error = "PIN incorrecto"; pin = "" }
            return
        }
        when {
            first == null -> { first = p; pin = ""; error = null }
            first == p -> onSuccess(p)
            else -> { error = "No coinciden, probá de nuevo"; first = null; pin = "" }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(
                    if (mode == "set") {
                        if (first == null) "Elegí un PIN de 4 números" else "Repetí el PIN para confirmar"
                    } else "Ingresá el PIN parental",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = pin,
                    onValueChange = { v -> if (v.length <= 4 && v.all { it.isDigit() }) { pin = v; error = null } },
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                )
                if (error != null) {
                    Text(
                        error!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = { submit() }) { Text("Aceptar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

/** Marcar un título (y/o su categoría) como apto para el modo Felix. */
@Composable
fun KidsMarkDialog(
    title: String,
    categoryName: String?,
    itemAllowed: Boolean,
    categoryAllowed: Boolean,
    onToggleItem: () -> Unit,
    onToggleCategory: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Apto para Felix", modifier = Modifier.weight(1f))
                    Switch(checked = itemAllowed, onCheckedChange = { onToggleItem() })
                }
                if (!categoryName.isNullOrBlank()) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Toda la categoría «$categoryName»",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Switch(checked = categoryAllowed, onCheckedChange = { onToggleCategory() })
                    }
                }
                Text(
                    "Lo marcado acá es lo único visible en el modo Felix.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Listo") } },
    )
}
