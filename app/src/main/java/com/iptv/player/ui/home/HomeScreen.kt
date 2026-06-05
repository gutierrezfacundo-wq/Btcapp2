package com.iptv.player.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.iptv.player.R
import com.iptv.player.data.local.RecentEntity
import com.iptv.player.data.model.Category
import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.MediaKind
import com.iptv.player.data.model.Movie
import com.iptv.player.data.model.SeriesInfo
import com.iptv.player.di.AppContainer
import androidx.media3.common.util.UnstableApi
import com.iptv.player.ui.components.ChannelRow
import com.iptv.player.ui.components.ChannelSearchBar
import com.iptv.player.ui.components.MiniPlayer
import com.iptv.player.ui.components.MultiSelectChipRow
import com.iptv.player.ui.components.PosterCard

private enum class HomeTab(val labelRes: Int, val icon: @Composable () -> Unit) {
    Live(R.string.nav_live, { Icon(Icons.Outlined.Tv, null) }),
    Movies(R.string.nav_movies, { Icon(Icons.Outlined.Movie, null) }),
    Series(R.string.nav_series, { Icon(Icons.Outlined.LiveTv, null) }),
    Favorites(R.string.nav_favorites, { Icon(Icons.Outlined.Favorite, null) }),
}

@OptIn(ExperimentalMaterial3Api::class, UnstableApi::class)
@Composable
fun HomeScreen(
    container: AppContainer,
    onPlay: (url: String, title: String) -> Unit,
    onOpenSeries: (id: String, title: String) -> Unit,
    onReconfigure: () -> Unit,
) {
    val vm: HomeViewModel = viewModel(factory = HomeViewModel.Factory(container))
    val state by vm.state.collectAsState()
    val favorites by vm.favorites.collectAsState()
    val recents by vm.recents.collectAsState()
    val activeQueue by container.playbackController.queue.collectAsState()
    val playerVisible by container.playbackController.playerVisible.collectAsState()
    var tab by rememberSaveable { mutableStateOf(HomeTab.Live) }
    var showGuide by rememberSaveable { mutableStateOf(false) }

    if (showGuide) {
        val liveChannels = state.catalog.liveChannels
        val epg by container.epgRepository.cache.collectAsState()
        BackHandler { showGuide = false }
        EpgGuide(
            channels = liveChannels,
            epg = epg,
            onPlayChannel = { idx ->
                vm.playLive(liveChannels, idx)
                val ch = liveChannels[idx]
                showGuide = false
                onPlay(ch.streamUrl, ch.name)
            },
            onBack = { showGuide = false },
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    IconButton(onClick = { showGuide = true }) {
                        Icon(Icons.Filled.DateRange, contentDescription = "Guía")
                    }
                    IconButton(onClick = vm::refresh) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Recargar")
                    }
                    IconButton(onClick = onReconfigure) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Ajustes")
                    }
                },
            )
        },
        bottomBar = {
            Column {
                val q = activeQueue
                if (q != null && !playerVisible) {
                    MiniPlayer(
                        player = container.playbackManager.player,
                        title = q.title,
                        onExpand = { onPlay(q.streamUrl, q.title) },
                        onClose = {
                            container.playbackManager.stop()
                            container.playbackController.clear()
                        },
                    )
                }
                NavigationBar {
                    HomeTab.entries.forEach { entry ->
                        NavigationBarItem(
                            selected = tab == entry,
                            onClick = { tab = entry },
                            icon = entry.icon,
                            label = { Text(stringResource(entry.labelRes)) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.loading -> LoadingBox()
                state.error != null -> ErrorBox(state.error!!)
                else -> when (tab) {
                    HomeTab.Live -> LiveTab(
                        channels = state.catalog.liveChannels,
                        categories = state.catalog.liveCategories,
                        recents = recents,
                        channelQuality = state.channelQuality,
                        availableQualities = state.availableQualities,
                        isFavorite = vm::isFavorite,
                        nowPlaying = vm::nowPlayingFor,
                        onToggleFavorite = vm::toggleFavorite,
                        onPlayChannel = { filtered, idx ->
                            vm.playLive(filtered, idx)
                            val ch = filtered[idx]
                            onPlay(ch.streamUrl, ch.name)
                        },
                        onResumeRecent = { item ->
                            when (item.kindOrdinal) {
                                MediaKind.LIVE.ordinal -> vm.resumeRecentAsLive(item, state.catalog.liveChannels)
                                else -> vm.resumeRecent(item)
                            }
                            onPlay(item.streamUrl, item.title)
                        },
                        onRemoveRecent = vm::removeRecent,
                    )
                    HomeTab.Movies -> MoviesTab(
                        movies = state.catalog.movies,
                        categories = state.catalog.movieCategories,
                        onPlay = { movie ->
                            vm.playSingle(movie.name, movie.streamUrl, movie.posterUrl)
                            onPlay(movie.streamUrl, movie.name)
                        },
                    )
                    HomeTab.Series -> SeriesTab(
                        series = state.catalog.series,
                        categories = state.catalog.seriesCategories,
                        onOpen = onOpenSeries,
                    )
                    HomeTab.Favorites -> FavoritesTab(
                        favorites = favorites.map {
                            Channel(
                                id = it.id,
                                name = it.name,
                                streamUrl = it.streamUrl,
                                logoUrl = it.logoUrl,
                                groupTitle = null,
                                tvgId = null,
                                kind = MediaKind.entries.getOrElse(it.kindOrdinal) { MediaKind.LIVE },
                            )
                        },
                        onToggleFavorite = { ch ->
                            vm.toggleFavorite(ch.id, ch.name, ch.streamUrl, ch.logoUrl, ch.kind)
                        },
                        onPlay = { ch ->
                            vm.playSingle(ch.name, ch.streamUrl, ch.logoUrl)
                            onPlay(ch.streamUrl, ch.name)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadingBox() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Text(stringResource(R.string.loading), modifier = Modifier.padding(top = 12.dp))
        }
    }
}

@Composable
private fun ErrorBox(msg: String) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(msg, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun CategoryChips(
    categories: List<Category>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            FilterChip(
                selected = selected == null,
                onClick = { onSelect(null) },
                label = { Text(stringResource(R.string.all_categories)) },
            )
        }
        items(categories) { cat ->
            FilterChip(
                selected = selected == cat.name,
                onClick = { onSelect(cat.name) },
                label = { Text(cat.name) },
            )
        }
    }
}

@Composable
private fun LiveTab(
    channels: List<Channel>,
    categories: List<Category>,
    recents: List<RecentEntity>,
    channelQuality: Map<String, String>,
    availableQualities: List<String>,
    isFavorite: (String) -> Boolean,
    nowPlaying: (Channel) -> String?,
    onToggleFavorite: (String, String, String, String?, MediaKind) -> Unit,
    onPlayChannel: (filtered: List<Channel>, index: Int) -> Unit,
    onResumeRecent: (RecentEntity) -> Unit,
    onRemoveRecent: (String) -> Unit,
) {
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var selectedQualities by rememberSaveable { mutableStateOf(emptySet<String>()) }

    val filtered = remember(
        channels, category, query, selectedQualities, channelQuality,
    ) {
        val q = query.trim()
        channels.filter { ch ->
            val categoryOk = category == null || ch.groupTitle == category
            if (!categoryOk) return@filter false
            val queryOk = q.isEmpty() ||
                ch.name.contains(q, ignoreCase = true) ||
                (ch.groupTitle?.contains(q, ignoreCase = true) == true)
            if (!queryOk) return@filter false
            if (selectedQualities.isEmpty()) return@filter true
            val qy = channelQuality[ch.id]
            qy != null && qy in selectedQualities
        }
    }

    Row(Modifier.fillMaxSize()) {
        CategorySidebar(
            categories = categories,
            selected = category,
            onSelect = { category = it },
            modifier = Modifier.width(140.dp).fillMaxHeight(),
        )
        Column(Modifier.weight(1f).fillMaxHeight()) {
            if (recents.isNotEmpty()) {
                RecentsRow(
                    recentItems = recents,
                    onClick = onResumeRecent,
                    onRemove = onRemoveRecent,
                )
            }
            ChannelSearchBar(query = query, onQueryChange = { query = it })
            MultiSelectChipRow(
                label = "Calidad",
                options = availableQualities,
                selected = selectedQualities,
                onToggle = { q -> selectedQualities = selectedQualities.toggle(q) },
            )
            if (filtered.isEmpty()) {
                EmptyBox()
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    itemsIndexed(filtered, key = { _, ch -> ch.id }) { idx, ch ->
                        ChannelRow(
                            name = ch.name,
                            subtitle = nowPlaying(ch) ?: ch.groupTitle,
                            logoUrl = ch.logoUrl,
                            isFavorite = isFavorite(ch.id),
                            onClick = { onPlayChannel(filtered, idx) },
                            onToggleFavorite = {
                                onToggleFavorite(ch.id, ch.name, ch.streamUrl, ch.logoUrl, ch.kind)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CategorySidebar(
    categories: List<Category>,
    selected: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
    ) {
        Text(
            "Categorías",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
        )
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item {
                CategorySidebarItem(
                    label = stringResource(R.string.all_categories),
                    isSelected = selected == null,
                    onClick = { onSelect(null) },
                )
            }
            items(categories, key = { it.id }) { cat ->
                CategorySidebarItem(
                    label = cat.name,
                    isSelected = selected == cat.name,
                    onClick = { onSelect(cat.name) },
                )
            }
        }
    }
}

@Composable
private fun CategorySidebarItem(label: String, isSelected: Boolean, onClick: () -> Unit) {
    val bg = if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else Color.Transparent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isSelected) {
            Box(
                Modifier
                    .width(3.dp)
                    .height(18.dp)
                    .background(MaterialTheme.colorScheme.primary),
            )
            Spacer(Modifier.width(8.dp))
        } else {
            Spacer(Modifier.width(11.dp))
        }
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (isSelected) MaterialTheme.colorScheme.onSurface
                else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun Set<String>.toggle(value: String): Set<String> =
    if (value in this) this - value else this + value

@Composable
private fun RecentsRow(
    recentItems: List<RecentEntity>,
    onClick: (RecentEntity) -> Unit,
    onRemove: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Text(
            "Continuar viendo",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(recentItems, key = { it.streamUrl }) { item ->
                RecentCard(item = item, onClick = { onClick(item) }, onRemove = { onRemove(item.streamUrl) })
            }
        }
    }
}

@Composable
private fun RecentCard(item: RecentEntity, onClick: () -> Unit, onRemove: () -> Unit) {
    val isLive = item.kindOrdinal == MediaKind.LIVE.ordinal
    Box(
        modifier = Modifier
            .width(160.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(90.dp)
                    .background(Color(0xFF1C1C1F)),
                contentAlignment = Alignment.Center,
            ) {
                if (!item.logoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = item.logoUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        if (isLive) Icons.Outlined.LiveTv else Icons.Outlined.Movie,
                        contentDescription = null,
                        tint = Color.White,
                    )
                }
                Icon(
                    Icons.Outlined.PlayArrow,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.85f),
                    modifier = Modifier.size(36.dp),
                )
            }
            if (!isLive && item.durationMs > 0 && item.positionMs > 0) {
                LinearProgressIndicator(
                    progress = {
                        (item.positionMs.toFloat() / item.durationMs.toFloat()).coerceIn(0f, 1f)
                    },
                    modifier = Modifier.fillMaxWidth().height(3.dp),
                )
            }
            Text(
                item.title,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            )
        }
        IconButton(
            onClick = onRemove,
            modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
        ) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = "Quitar",
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun MoviesTab(
    movies: List<Movie>,
    categories: List<Category>,
    onPlay: (Movie) -> Unit,
) {
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    val filtered = remember(movies, selected, query) {
        val q = query.trim()
        movies.filter { m ->
            (selected == null || m.category == selected) &&
                (q.isEmpty() || m.name.contains(q, ignoreCase = true))
        }
    }
    Column {
        ChannelSearchBar(query = query, onQueryChange = { query = it }, placeholder = "Buscar película…")
        CategoryChips(categories, selected) { selected = it }
        if (filtered.isEmpty()) EmptyBox()
        else LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 140.dp),
            contentPadding = PaddingValues(8.dp),
        ) {
            items(filtered, key = { it.id }) { movie ->
                PosterCard(
                    title = movie.name,
                    posterUrl = movie.posterUrl,
                    onClick = { onPlay(movie) },
                )
            }
        }
    }
}

@Composable
private fun SeriesTab(
    series: List<SeriesInfo>,
    categories: List<Category>,
    onOpen: (String, String) -> Unit,
) {
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    val filtered = remember(series, selected, query) {
        val q = query.trim()
        series.filter { s ->
            (selected == null || s.category == selected) &&
                (q.isEmpty() || s.name.contains(q, ignoreCase = true))
        }
    }
    Column {
        ChannelSearchBar(query = query, onQueryChange = { query = it }, placeholder = "Buscar serie…")
        CategoryChips(categories, selected) { selected = it }
        if (filtered.isEmpty()) EmptyBox()
        else LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 140.dp),
            contentPadding = PaddingValues(8.dp),
        ) {
            items(filtered, key = { it.id }) { s ->
                PosterCard(
                    title = s.name,
                    posterUrl = s.posterUrl,
                    onClick = { onOpen(s.id, s.name) },
                )
            }
        }
    }
}

@Composable
private fun FavoritesTab(
    favorites: List<Channel>,
    onToggleFavorite: (Channel) -> Unit,
    onPlay: (Channel) -> Unit,
) {
    if (favorites.isEmpty()) EmptyBox()
    else LazyColumn {
        items(favorites, key = { it.id }) { ch ->
            ChannelRow(
                name = ch.name,
                subtitle = null,
                logoUrl = ch.logoUrl,
                isFavorite = true,
                onClick = { onPlay(ch) },
                onToggleFavorite = { onToggleFavorite(ch) },
            )
        }
    }
}

@Composable
private fun EmptyBox() {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(stringResource(R.string.empty))
    }
}
