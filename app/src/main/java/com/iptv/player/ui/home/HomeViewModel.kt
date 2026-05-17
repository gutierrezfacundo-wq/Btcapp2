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
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val catalog: Catalog = Catalog(),
    val source: SourceConfig? = null,
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
            _state.value = HomeUiState(loading = true, source = source)
            runCatching { container.iptvRepository.loadCatalog(source) }
                .onSuccess { catalog ->
                    _state.value = HomeUiState(loading = false, catalog = catalog, source = source)
                    launch {
                        runCatching { container.epgRepository.load(source) }
                    }
                }
                .onFailure { e ->
                    _state.value = HomeUiState(
                        loading = false,
                        error = e.message ?: "Error cargando contenido",
                        source = source,
                    )
                }
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
