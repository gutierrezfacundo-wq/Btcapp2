package com.iptv.player.ui.playlists

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DriveFileRenameOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.iptv.player.R
import com.iptv.player.data.local.PlaylistEntity
import com.iptv.player.di.AppContainer
import androidx.compose.ui.res.stringResource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistsScreen(
    container: AppContainer,
    onAddNew: () -> Unit,
    onEdit: (Long) -> Unit,
    onBack: () -> Unit,
) {
    val vm: PlaylistsViewModel = viewModel(factory = PlaylistsViewModel.Factory(container))
    val state by vm.state.collectAsState()
    var renaming by remember { mutableStateOf<PlaylistEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.playlists_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onAddNew,
                icon = { Icon(Icons.Outlined.Add, null) },
                text = { Text(stringResource(R.string.playlists_add)) },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (state.playlists.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.playlists_empty))
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(state.playlists, key = { it.id }) { pl ->
                        PlaylistRow(
                            playlist = pl,
                            isActive = pl.id == state.activeId,
                            onSelect = { vm.setActive(pl.id) },
                            onEdit = { onEdit(pl.id) },
                            onRename = { renaming = pl },
                            onDelete = { vm.delete(pl) },
                        )
                    }
                }
            }
        }
    }

    val toRename = renaming
    if (toRename != null) {
        var text by remember(toRename.id) { mutableStateOf(toRename.name) }
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text("Renombrar lista") },
            text = {
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    singleLine = true,
                    label = { Text(stringResource(R.string.setup_playlist_name)) },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.rename(toRename, text.trim())
                    renaming = null
                }) { Text("Guardar") }
            },
            dismissButton = {
                TextButton(onClick = { renaming = null }) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun PlaylistRow(
    playlist: PlaylistEntity,
    isActive: Boolean,
    onSelect: () -> Unit,
    onEdit: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onSelect)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = isActive, onClick = onSelect)
        Column(modifier = Modifier.weight(1f).padding(start = 4.dp)) {
            Text(
                playlist.name,
                fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (playlist.kind == "xtream") "Xtream · ${playlist.xServer.orEmpty()}"
                else "M3U · ${playlist.m3uUrl.orEmpty()}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onEdit) {
            Icon(Icons.Outlined.Edit, contentDescription = "Editar conexión")
        }
        IconButton(onClick = onRename) {
            Icon(Icons.Outlined.DriveFileRenameOutline, contentDescription = "Renombrar")
        }
        IconButton(onClick = onDelete) {
            Icon(Icons.Outlined.Delete, contentDescription = "Borrar")
        }
    }
}
