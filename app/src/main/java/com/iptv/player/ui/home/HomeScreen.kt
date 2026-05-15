package com.iptv.player.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.iptv.player.R
import com.iptv.player.data.model.Category
import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.MediaKind
import com.iptv.player.data.model.Movie
import com.iptv.player.data.model.SeriesInfo
import com.iptv.player.di.AppContainer
import com.iptv.player.ui.components.ChannelRow
import com.iptv.player.ui.components.PosterCard

private enum class HomeTab(val labelRes: Int, val icon: @Composable () -> Unit) {
    Live(R.string.nav_live, { Icon(Icons.Outlined.Tv, null) }),
    Movies(R.string.nav_movies, { Icon(Icons.Outlined.Movie, null) }),
    Series(R.string.nav_series, { Icon(Icons.Outlined.LiveTv, null) }),
    Favorites(R.string.nav_favorites, { Icon(Icons.Outlined.Favorite, null) }),
}

@OptIn(ExperimentalMaterial3Api::class)
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
    var tab by rememberSaveable { mutableStateOf(HomeTab.Live) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    IconButton(onClick = vm::load) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Recargar")
                    }
                    IconButton(onClick = onReconfigure) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Ajustes")
                    }
                },
            )
        },
        bottomBar = {
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
                        isFavorite = vm::isFavorite,
                        nowPlaying = vm::nowPlayingFor,
                        onToggleFavorite = vm::toggleFavorite,
                        onPlay = onPlay,
                    )
                    HomeTab.Movies -> MoviesTab(
                        movies = state.catalog.movies,
                        categories = state.catalog.movieCategories,
                        onPlay = onPlay,
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
                        onPlay = onPlay,
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
        Text("$msg", color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun CategoryChips(
    categories: List<Category>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
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
    isFavorite: (String) -> Boolean,
    nowPlaying: (Channel) -> String?,
    onToggleFavorite: (String, String, String, String?, MediaKind) -> Unit,
    onPlay: (String, String) -> Unit,
) {
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val filtered = remember(channels, selected) {
        if (selected == null) channels else channels.filter { it.groupTitle == selected }
    }
    Column {
        CategoryChips(categories, selected) { selected = it }
        if (filtered.isEmpty()) EmptyBox()
        else LazyColumn {
            items(filtered, key = { it.id }) { ch ->
                ChannelRow(
                    name = ch.name,
                    subtitle = nowPlaying(ch) ?: ch.groupTitle,
                    logoUrl = ch.logoUrl,
                    isFavorite = isFavorite(ch.id),
                    onClick = { onPlay(ch.streamUrl, ch.name) },
                    onToggleFavorite = {
                        onToggleFavorite(ch.id, ch.name, ch.streamUrl, ch.logoUrl, ch.kind)
                    },
                )
            }
        }
    }
}

@Composable
private fun MoviesTab(
    movies: List<Movie>,
    categories: List<Category>,
    onPlay: (String, String) -> Unit,
) {
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val filtered = remember(movies, selected) {
        if (selected == null) movies else movies.filter { it.category == selected }
    }
    Column {
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
                    onClick = { onPlay(movie.streamUrl, movie.name) },
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
    val filtered = remember(series, selected) {
        if (selected == null) series else series.filter { it.category == selected }
    }
    Column {
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
    onPlay: (String, String) -> Unit,
) {
    if (favorites.isEmpty()) EmptyBox()
    else LazyColumn {
        items(favorites, key = { it.id }) { ch ->
            ChannelRow(
                name = ch.name,
                subtitle = null,
                logoUrl = ch.logoUrl,
                isFavorite = true,
                onClick = { onPlay(ch.streamUrl, ch.name) },
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
