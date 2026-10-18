package com.iptv.player.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.PlaylistAdd
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.MediaKind
import com.iptv.player.data.repository.CollectionWithCount
import com.iptv.player.ui.components.ChannelRow

@Composable
fun AddToCollectionDialog(
    channelName: String,
    collections: List<CollectionWithCount>,
    memberIds: Set<Long>,
    onToggle: (collectionId: Long, included: Boolean) -> Unit,
    onCreateAndAdd: (name: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var newName by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Agregar a colección", maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        text = {
            Column {
                Text(
                    channelName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.heightIn(min = 8.dp).width(0.dp))
                if (collections.isEmpty()) {
                    Text(
                        "No tenés colecciones. Creá una abajo.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    Column(
                        modifier = Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState()),
                    ) {
                        collections.forEach { cw ->
                            val checked = cw.collection.id in memberIds
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onToggle(cw.collection.id, !checked) }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = checked,
                                    onCheckedChange = { onToggle(cw.collection.id, it) },
                                )
                                Text(
                                    cw.collection.name,
                                    modifier = Modifier.weight(1f).padding(start = 4.dp),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.heightIn(min = 12.dp).width(0.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newName,
                        onValueChange = { newName = it },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        label = { Text("Nueva colección") },
                    )
                    TextButton(
                        onClick = {
                            if (newName.isNotBlank()) {
                                onCreateAndAdd(newName.trim())
                                newName = ""
                            }
                        },
                        enabled = newName.isNotBlank(),
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = "Crear y agregar")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Listo") }
        },
    )
}

private sealed interface FavView {
    data object Root : FavView
    data object Favorites : FavView
    data class Collection(val id: Long, val name: String) : FavView
}

@Composable
fun FavoritesAndCollectionsTab(
    vm: HomeViewModel,
    onPlay: (url: String, title: String) -> Unit,
) {
    val collections by vm.collections.collectAsState()
    val favorites by vm.favorites.collectAsState()
    var view by remember { mutableStateOf<FavView>(FavView.Root) }
    var showCreate by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf<CollectionWithCount?>(null) }

    when (val v = view) {
        FavView.Root -> {
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    CollectionCard(
                        title = "❤ Favoritos",
                        subtitle = "${favorites.size} canales",
                        onClick = { view = FavView.Favorites },
                    )
                }
                items(collections, key = { it.collection.id }) { cw ->
                    CollectionCard(
                        title = cw.collection.name,
                        subtitle = "${cw.count} canales",
                        onClick = { view = FavView.Collection(cw.collection.id, cw.collection.name) },
                        onRename = { renaming = cw },
                        onDelete = { vm.deleteCollection(cw.collection.id) },
                    )
                }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showCreate = true }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.PlaylistAdd, contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text("Nueva colección", color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        FavView.Favorites -> {
            BackHandler { view = FavView.Root }
            val favChannels = favorites.map { it.toChannel() }
            Column(Modifier.fillMaxSize()) {
                CollectionHeader("❤ Favoritos") { view = FavView.Root }
                if (favChannels.isEmpty()) EmptyBox()
                else LazyColumn(Modifier.fillMaxSize()) {
                    itemsIndexed(favChannels, key = { _, c -> c.id }) { idx, ch ->
                        ChannelRow(
                            name = ch.name,
                            subtitle = null,
                            logoUrl = ch.logoUrl,
                            isFavorite = true,
                            onClick = {
                                vm.playLive(favChannels, idx)
                                onPlay(ch.streamUrl, ch.name)
                            },
                            onToggleFavorite = {
                                vm.toggleFavorite(ch.id, ch.name, ch.streamUrl, ch.logoUrl, ch.kind)
                            },
                        )
                    }
                }
            }
        }
        is FavView.Collection -> {
            BackHandler { view = FavView.Root }
            val items by vm.collectionItems(v.id).collectAsState(initial = emptyList())
            Column(Modifier.fillMaxSize()) {
                CollectionHeader(v.name) { view = FavView.Root }
                if (items.isEmpty()) EmptyBox()
                else LazyColumn(Modifier.fillMaxSize()) {
                    itemsIndexed(items, key = { _, it -> it.channelId }) { idx, item ->
                        ChannelRow(
                            name = item.name,
                            subtitle = null,
                            logoUrl = item.logoUrl,
                            isFavorite = true,
                            onClick = {
                                vm.playCollection(items, idx)
                                onPlay(item.streamUrl, item.name)
                            },
                            onToggleFavorite = { vm.removeFromCollection(v.id, item.channelId) },
                        )
                    }
                }
            }
        }
    }

    if (showCreate) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreate = false },
            title = { Text("Nueva colección") },
            text = {
                OutlinedTextField(
                    value = name, onValueChange = { name = it }, singleLine = true,
                    label = { Text("Nombre") },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { vm.createCollection(name.trim()); showCreate = false },
                    enabled = name.isNotBlank(),
                ) { Text("Crear") }
            },
            dismissButton = { TextButton(onClick = { showCreate = false }) { Text("Cancelar") } },
        )
    }

    val toRename = renaming
    if (toRename != null) {
        var text by remember(toRename.collection.id) { mutableStateOf(toRename.collection.name) }
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text("Renombrar colección") },
            text = {
                OutlinedTextField(
                    value = text, onValueChange = { text = it }, singleLine = true,
                    label = { Text("Nombre") },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.renameCollection(toRename.collection.id, text.trim())
                    renaming = null
                }) { Text("Guardar") }
            },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun CollectionCard(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    onRename: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            if (onRename != null) {
                IconButton(onClick = onRename) { Icon(Icons.Outlined.Edit, contentDescription = "Renombrar") }
            }
            if (onDelete != null) {
                IconButton(onClick = onDelete) { Icon(Icons.Outlined.Delete, contentDescription = "Borrar") }
            }
            if (onRename == null && onDelete == null) {
                Icon(Icons.Outlined.ChevronRight, contentDescription = null,
                    modifier = Modifier.padding(end = 12.dp))
            }
        }
    }
}

@Composable
private fun CollectionHeader(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver")
        }
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 4.dp),
        )
    }
}

private fun com.iptv.player.data.local.FavoriteEntity.toChannel() = Channel(
    id = id,
    name = name,
    streamUrl = streamUrl,
    logoUrl = logoUrl,
    groupTitle = null,
    tvgId = null,
    kind = MediaKind.entries.getOrElse(kindOrdinal) { MediaKind.LIVE },
)
