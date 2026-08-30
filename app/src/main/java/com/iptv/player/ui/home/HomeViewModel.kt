package com.iptv.player.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.iptv.player.data.local.CategoryPrefEntity
import com.iptv.player.data.local.ChannelPrefEntity
import com.iptv.player.data.local.EpgMapEntity
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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val CACHE_TTL_MS = 6 * 60 * 60 * 1000L // 6 horas

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val catalog: Catalog = Catalog(),
    val source: SourceConfig? = null,
    val channelQuality: Map<String, String> = emptyMap(),
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

    /** Nombre de la lista activa, para mostrar en la UI. */
    val activePlaylistName = container.playlistRepository.activePlaylist
        .map { it?.name }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        // Recarga automaticamente cuando cambia la lista activa.
        viewModelScope.launch {
            container.playlistRepository.activeSource
                .filterNotNull()
                .distinctUntilChanged()
                .collect { source -> loadFor(source, forceRefresh = false) }
        }
    }

    fun refresh() {
        val source = _state.value.source ?: return
        loadFor(source, forceRefresh = true)
    }

    private fun loadFor(source: SourceConfig, forceRefresh: Boolean) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            // Si ya hay contenido visible, NO mostramos "Cargando…": refrescamos en silencio.
            val current = _state.value
            val hasContent = current.catalog.liveChannels.isNotEmpty() && current.source == source
            if (!hasContent) {
                _state.value = HomeUiState(loading = true)
            }

            // 1) Mostrar el catalogo cacheado al instante (si existe y aun no hay contenido)
            val cached = if (!hasContent) {
                runCatching { container.catalogCache.load(source) }.getOrNull()
            } else null
            val cacheFresh = container.catalogCache.ageMs(source) < CACHE_TTL_MS
            if (cached != null) {
                _state.value = HomeUiState(loading = false, catalog = cached, source = source)
                launch { computeChannelTags(cached.liveChannels) }
                launch { runCatching { container.epgRepository.load(source) } }
                // Si el cache es fresco y no se pidio refrescar, no golpeamos la red.
                if (cacheFresh && !forceRefresh) return@launch
            } else if (hasContent && cacheFresh && !forceRefresh) {
                // Ya tenemos contenido en memoria y el cache es reciente: nada que hacer.
                return@launch
            } else if (!hasContent) {
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
        val quality = HashMap<String, String>(channels.size)
        val qualities = LinkedHashSet<String>()
        for (ch in channels) {
            val q = ChannelAttributes.qualityOf(ch)
            if (q.isNotEmpty()) {
                quality[ch.id] = q
                qualities.add(q)
            }
        }
        val orderedQualities = listOf("4K", "FHD", "HD", "SD").filter { it in qualities }
        _state.update { current ->
            current.copy(
                channelQuality = quality,
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

    // --- Modo Felix (niños) ---
    data class KidsState(
        val on: Boolean = false,
        val categories: Set<String> = emptySet(),
        val items: Set<String> = emptySet(),
    ) {
        fun allowsChannel(ch: Channel): Boolean =
            !on || (ch.groupTitle != null && ch.groupTitle in categories) || ch.id in items
        fun allows(category: String?, id: String): Boolean =
            !on || (category != null && category in categories) || id in items
    }

    val kidsState = combine(
        container.preferencesStore.kidsMode,
        container.preferencesStore.kidsCategories,
        container.preferencesStore.kidsItems,
    ) { on, cats, items -> KidsState(on, cats, items) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, KidsState())

    val parentalPin = container.preferencesStore.parentalPin
        .stateIn(viewModelScope, SharingStarted.Eagerly, "")

    fun setKidsMode(on: Boolean) {
        viewModelScope.launch { container.preferencesStore.setKidsMode(on) }
    }

    fun setParentalPin(pin: String) {
        viewModelScope.launch { container.preferencesStore.setParentalPin(pin) }
    }

    fun toggleKidsCategory(name: String) {
        viewModelScope.launch { container.preferencesStore.toggleKidsCategory(name) }
    }

    fun toggleKidsItem(id: String) {
        viewModelScope.launch { container.preferencesStore.toggleKidsItem(id) }
    }

    // --- Gestion de canales (ocultar / renombrar / numero) ---
    val channelPrefs = container.database.channelPrefDao().observeAll()
        .map { list -> list.associateBy { it.channelId } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    val hiddenCategories = container.database.categoryPrefDao().observeHidden()
        .map { list -> list.map { it.name }.toSet() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    /** Canales en vivo con preferencias aplicadas: sin ocultos, renombrados y ordenados. */
    val displayLiveChannels = combine(state, channelPrefs, hiddenCategories, kidsState) { s, prefs, hiddenCats, kids ->
        s.catalog.liveChannels
            .asSequence()
            .filter { ch -> prefs[ch.id]?.hidden != true }
            .filter { ch -> ch.groupTitle == null || ch.groupTitle !in hiddenCats }
            .filter { ch -> kids.allowsChannel(ch) }
            .map { ch ->
                val custom = prefs[ch.id]?.customName
                if (custom.isNullOrBlank()) ch else ch.copy(name = custom)
            }
            .toList()
            .sortedWith(compareBy<Channel, Int?>(nullsLast()) { prefs[it.id]?.customNumber })
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val displayLiveCategories = combine(state, hiddenCategories, kidsState) { s, hiddenCats, kids ->
        s.catalog.liveCategories
            .filter { it.name !in hiddenCats }
            .filter { !kids.on || it.name in kids.categories }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Películas/series visibles (en modo Felix, solo lo apto). */
    val displayMovies = combine(state, kidsState) { s, kids ->
        if (!kids.on) s.catalog.movies
        else s.catalog.movies.filter { kids.allows(it.category, it.id) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val displaySeries = combine(state, kidsState) { s, kids ->
        if (!kids.on) s.catalog.series
        else s.catalog.series.filter { kids.allows(it.category, it.id) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val displayMovieCategories = combine(state, kidsState) { s, kids ->
        if (!kids.on) s.catalog.movieCategories
        else s.catalog.movieCategories.filter { it.name in kids.categories }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val displaySeriesCategories = combine(state, kidsState) { s, kids ->
        if (!kids.on) s.catalog.seriesCategories
        else s.catalog.seriesCategories.filter { it.name in kids.categories }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    fun setChannelHidden(channelId: String, hidden: Boolean) {
        viewModelScope.launch {
            val dao = container.database.channelPrefDao()
            val cur = dao.get(channelId) ?: ChannelPrefEntity(channelId)
            dao.upsert(cur.copy(hidden = hidden))
        }
    }

    fun renameChannel(channelId: String, name: String?) {
        viewModelScope.launch {
            val dao = container.database.channelPrefDao()
            val cur = dao.get(channelId) ?: ChannelPrefEntity(channelId)
            dao.upsert(cur.copy(customName = name?.takeIf { it.isNotBlank() }))
        }
    }

    fun setChannelNumber(channelId: String, number: Int?) {
        viewModelScope.launch {
            val dao = container.database.channelPrefDao()
            val cur = dao.get(channelId) ?: ChannelPrefEntity(channelId)
            dao.upsert(cur.copy(customNumber = number))
        }
    }

    fun setCategoryHidden(name: String, hidden: Boolean) {
        viewModelScope.launch {
            if (hidden) container.database.categoryPrefDao().upsert(CategoryPrefEntity(name, true))
            else container.database.categoryPrefDao().delete(name)
        }
    }

    // --- Mapeo manual de EPG ---
    val epgMap = container.database.epgMapDao().observeAll()
        .map { list -> list.associate { it.channelId to it.tvgId } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    /** Ids de canal disponibles en la guia XMLTV cargada, para el dialogo de mapeo. */
    fun availableEpgIds(): List<String> =
        container.epgRepository.cache.value.keys.sorted()

    fun setEpgMapping(channelId: String, tvgId: String?) {
        viewModelScope.launch {
            if (tvgId.isNullOrBlank()) container.database.epgMapDao().delete(channelId)
            else container.database.epgMapDao().upsert(EpgMapEntity(channelId, tvgId))
        }
    }

    private fun effectiveTvgId(channel: Channel): String? =
        epgMap.value[channel.id] ?: channel.tvgId

    // --- Colecciones de favoritos ---
    val collections = container.collectionRepository.collections
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    fun collectionsContaining(channelId: String) =
        container.collectionRepository.collectionsContaining(channelId)

    fun collectionItems(id: Long) = container.collectionRepository.items(id)

    fun createCollection(name: String) {
        viewModelScope.launch { container.collectionRepository.createCollection(name) }
    }

    fun createCollectionWith(name: String, channel: Channel) {
        viewModelScope.launch {
            val id = container.collectionRepository.createCollection(name)
            container.collectionRepository.addChannel(id, channel)
        }
    }

    fun setChannelInCollection(collectionId: Long, channel: Channel, included: Boolean) {
        viewModelScope.launch {
            if (included) container.collectionRepository.addChannel(collectionId, channel)
            else container.collectionRepository.removeChannel(collectionId, channel.id)
        }
    }

    fun renameCollection(id: Long, name: String) {
        viewModelScope.launch { container.collectionRepository.rename(id, name) }
    }

    fun removeFromCollection(collectionId: Long, channelId: String) {
        viewModelScope.launch { container.collectionRepository.removeChannel(collectionId, channelId) }
    }

    fun deleteCollection(id: Long) {
        viewModelScope.launch { container.collectionRepository.deleteCollection(id) }
    }

    fun nowPlayingFor(channel: Channel): String? =
        container.epgRepository.nowPlaying(effectiveTvgId(channel))?.title

    fun playLive(channels: List<Channel>, activeIndex: Int) {
        container.playbackController.setLive(channels, activeIndex)
    }

    /** Reproduce desde una coleccion; el zapping navega dentro de la coleccion. */
    fun playCollection(items: List<com.iptv.player.data.local.CollectionItemEntity>, index: Int) {
        val channels = items.map { item ->
            Channel(
                id = item.channelId,
                name = item.name,
                streamUrl = item.streamUrl,
                logoUrl = item.logoUrl,
                groupTitle = null,
                tvgId = null,
                kind = MediaKind.entries.getOrElse(item.kindOrdinal) { MediaKind.LIVE },
            )
        }
        container.playbackController.setLive(channels, index)
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
