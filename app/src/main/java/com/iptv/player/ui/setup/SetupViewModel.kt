package com.iptv.player.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.iptv.player.data.local.PlaylistEntity
import com.iptv.player.di.AppContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SetupUiState(
    val saving: Boolean = false,
    val error: String? = null,
)

class SetupViewModel(private val container: AppContainer) : ViewModel() {

    private val _state = MutableStateFlow(SetupUiState())
    val state = _state.asStateFlow()

    fun saveM3u(name: String, url: String, epgUrl: String?, onDone: () -> Unit) {
        viewModelScope.launch {
            _state.value = SetupUiState(saving = true)
            runCatching {
                container.playlistRepository.add(
                    PlaylistEntity(
                        name = name.ifBlank { "Lista M3U" },
                        kind = "m3u",
                        m3uUrl = url,
                        epgUrl = epgUrl,
                    )
                )
            }
                .onSuccess {
                    _state.value = SetupUiState()
                    onDone()
                }
                .onFailure { e ->
                    _state.value = SetupUiState(error = e.message ?: "Error guardando")
                }
        }
    }

    fun saveXtream(name: String, server: String, user: String, pass: String, onDone: () -> Unit) {
        viewModelScope.launch {
            _state.value = SetupUiState(saving = true)
            runCatching {
                container.playlistRepository.add(
                    PlaylistEntity(
                        name = name.ifBlank { "Xtream" },
                        kind = "xtream",
                        xServer = server,
                        xUser = user,
                        xPass = pass,
                    )
                )
            }
                .onSuccess {
                    _state.value = SetupUiState()
                    onDone()
                }
                .onFailure { e ->
                    _state.value = SetupUiState(error = e.message ?: "Error guardando")
                }
        }
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            SetupViewModel(container) as T
    }
}
