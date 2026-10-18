package com.iptv.player.ui.playlists

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.iptv.player.data.local.PlaylistEntity
import com.iptv.player.di.AppContainer
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class PlaylistsUiState(
    val playlists: List<PlaylistEntity> = emptyList(),
    val activeId: Long? = null,
)

class PlaylistsViewModel(private val container: AppContainer) : ViewModel() {

    val state = combine(
        container.playlistRepository.playlists,
        container.preferencesStore.activePlaylistId,
    ) { list, activeId ->
        PlaylistsUiState(
            playlists = list,
            activeId = activeId ?: list.firstOrNull()?.id,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, PlaylistsUiState())

    fun setActive(id: Long) {
        viewModelScope.launch { container.playlistRepository.setActive(id) }
    }

    fun delete(entity: PlaylistEntity) {
        viewModelScope.launch { container.playlistRepository.delete(entity) }
    }

    fun rename(entity: PlaylistEntity, newName: String) {
        viewModelScope.launch {
            container.playlistRepository.update(entity.copy(name = newName.ifBlank { entity.name }))
        }
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            PlaylistsViewModel(container) as T
    }
}
