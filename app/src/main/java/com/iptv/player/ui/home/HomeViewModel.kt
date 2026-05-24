package com.iptv.player.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.iptv.player.data.local.FavoriteEntity
import com.iptv.player.data.local.RecentEntity
import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.MediaKind
import com.iptv.player.data.model.Movie
import com.iptv.player.data.model.SourceConfig
import com.iptv.player.data.repository.Catalog
import com.iptv.player.di.AppContainer
import com.iptv.player.ui.components.ChannelAttributes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val catalog: Catalog = Catalog(),
    val source: SourceConfig? = null,
    val channelTags: Map<String, ChannelAttributes.Tags> = emptyMap(),
    val availableCountries: List<String> = emptyList(),
    val availableLanguages: List<String> = emptyList(),
    val availableQualities: List<String> = emptyList(),
)

class HomeViewModel(private val container: AppContainer) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state = _state.asStateFlow()

    val favorites = container.database.favoriteDao().observeAll()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val recents = container.database.recentDao().observeRecent()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.value = HomeUiState(loading = true)
            val source = container.preferencesStore.source.filterNotNull().first()

            // 1) Mostrar el catalogo cacheado al instante (si existe)
            val cached = runCatching { container.catalogCache.load(source) }.getOrNull()
            if (cached != null) {
                _state.value = HomeUiState(loading = false, catalog = cached, source = source)
                launch { computeChannelTags(cached.liveChannels) }
                launch { runCatching { container.epgRepository.load(source) } }
            } else {
                _state.value = HomeUiState(loading = true, source = source)
            }

            // 2) Refrescar desde la red en segundo plano
            runCatching { container.iptvRepository.loadCatalog(source) }
                .onSuccess { catalog ->
                    _state.value = HomeUiState(loading = false, catalog = catalog, source = source)
                    launch { computeChannelTags(catalog.liveChannels) }
                    launch { runCatching { container.catalogCache.save(source, catalog) } }
                    launch { runCatching { container.epgRepository.load(source) } }
                }
                .onFailure { e ->
                    if (cached == null) {
                        _state.value = HomeUiState(
                            loading = false,
                            error = e.message ?: "Error cargando contenido",
                            source = source,
                        )
                    }
                }
        }
    }

    private suspend fun computeChannelTags(channels: List<Channel>) = withContext(Dispatchers.Default) {
        val tags = HashMap<String, ChannelAttributes.Tags>(channels.size)
        val countries = LinkedHashSet<String>()
        val languages = LinkedHashSet<String>()
        val qualities = LinkedHashSet<String>()
        for (ch in channels) {
            val t = ChannelAttributes.extract(ch)
            tags[ch.id] = t
            countries.addAll(t.countries)
            languages.addAll(t.languages)
            qualities.addAll(t.qualities)
        }
        val sortedCountries = countries.sorted()
        val sortedLanguages = languages.sorted()
        val orderedQualities = listOf("4K", "FHD", "HD", "SD").filter { it in qualities }
        _state.update { current ->
            current.copy(
                channelTags = tags,
                availableCountries = sortedCountries,
                availableLanguages = sortedLanguages,
                availableQualities = orderedQualities,
            )
        }
    }

    fun toggleFavorite(id: String, name: String, url: String, logo: String?, kind: MediaKind) {
        viewModelScope.launch {
            val dao = container.database.favoriteDao()
            val current = favorites.value.any { it.id == id }
            if (current) {
                dao.remove(id)
            } else {
                dao.upsert(FavoriteEntity(id, name, url, logo, kind.ordinal))
            }
        }
    }

    fun isFavorite(id: String): Boolean = favorites.value.any { it.id == id }

    fun nowPlayingFor(channel: Channel): String? =
        container.epgRepository.nowPlaying(channel.tvgId)?.title

    fun playLive(channels: List<Channel>, activeIndex: Int) {
        container.playbackController.setLive(channels, activeIndex)
    }

    fun playSingle(name: String, url: String, poster: String?) {
        container.playbackController.setSingle(name, url, poster)
    }

    fun removeRecent(url: String) {
        viewModelScope.launch { container.database.recentDao().remove(url) }
    }

    fun resumeRecent(item: RecentEntity) {
        container.playbackController.setSingle(item.title, item.streamUrl, item.logoUrl)
    }

    fun resumeRecentAsLive(item: RecentEntity, allLive: List<Channel>) {
        val idx = allLive.indexOfFirst { it.streamUrl == item.streamUrl }
        if (idx >= 0) container.playbackController.setLive(allLive, idx)
        else container.playbackController.setSingle(item.title, item.streamUrl, item.logoUrl)
    }

    suspend fun seriesEpisodes(seriesId: String): List<com.iptv.player.data.model.Episode> {
        val source = state.value.source as? SourceConfig.Xtream ?: return emptyList()
        val id = seriesId.toIntOrNull() ?: return emptyList()
        return container.iptvRepository.seriesEpisodes(source, id)
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            HomeViewModel(container) as T
    }
}
