package com.iptv.player.data.repository

import com.iptv.player.data.local.PlaylistDao
import com.iptv.player.data.local.PlaylistEntity
import com.iptv.player.data.local.PreferencesStore
import com.iptv.player.data.model.SourceConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

class PlaylistRepository(
    private val dao: PlaylistDao,
    private val prefs: PreferencesStore,
) {
    val playlists: Flow<List<PlaylistEntity>> = dao.observeAll()

    val activePlaylist: Flow<PlaylistEntity?> =
        combine(dao.observeAll(), prefs.activePlaylistId) { list, activeId ->
            list.firstOrNull { it.id == activeId } ?: list.firstOrNull()
        }

    val activeSource: Flow<SourceConfig?> =
        combine(dao.observeAll(), prefs.activePlaylistId) { list, activeId ->
            (list.firstOrNull { it.id == activeId } ?: list.firstOrNull())?.toSourceConfig()
        }

    suspend fun add(entity: PlaylistEntity, makeActive: Boolean = true): Long {
        val id = dao.insert(entity)
        if (makeActive) prefs.setActivePlaylistId(id)
        return id
    }

    suspend fun update(entity: PlaylistEntity) = dao.update(entity)

    suspend fun delete(entity: PlaylistEntity) {
        dao.deleteById(entity.id)
        // Si borramos la activa, activar la primera que quede.
        val remaining = dao.getAll()
        remaining.firstOrNull()?.let { prefs.setActivePlaylistId(it.id) }
    }

    suspend fun setActive(id: Long) = prefs.setActivePlaylistId(id)

    /** Importa la config unica anterior a las multilistas como una playlist "Mi lista". */
    suspend fun migrateLegacyIfNeeded() {
        if (dao.count() > 0) return
        val legacy = prefs.readLegacySourceOnce() ?: return
        val entity = when (legacy) {
            is SourceConfig.M3u -> PlaylistEntity(
                name = "Mi lista",
                kind = "m3u",
                m3uUrl = legacy.playlistUrl,
                epgUrl = legacy.epgUrl,
            )
            is SourceConfig.Xtream -> PlaylistEntity(
                name = "Mi lista",
                kind = "xtream",
                xServer = legacy.server,
                xUser = legacy.username,
                xPass = legacy.password,
            )
        }
        val id = dao.insert(entity)
        prefs.setActivePlaylistId(id)
        prefs.clearLegacySource()
    }
}
