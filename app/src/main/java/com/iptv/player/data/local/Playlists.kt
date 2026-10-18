package com.iptv.player.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Update
import com.iptv.player.data.model.SourceConfig
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val kind: String, // "m3u" | "xtream"
    val m3uUrl: String? = null,
    val epgUrl: String? = null,
    val xServer: String? = null,
    val xUser: String? = null,
    val xPass: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
) {
    fun toSourceConfig(): SourceConfig? = when (kind) {
        "m3u" -> m3uUrl?.takeIf { it.isNotBlank() }
            ?.let { SourceConfig.M3u(it, epgUrl?.takeIf { e -> e.isNotBlank() }) }
        "xtream" -> {
            val s = xServer.orEmpty(); val u = xUser.orEmpty(); val p = xPass.orEmpty()
            if (s.isBlank() || u.isBlank() || p.isBlank()) null
            else SourceConfig.Xtream(s, u, p)
        }
        else -> null
    }
}

@Dao
interface PlaylistDao {
    @Query("SELECT * FROM playlists ORDER BY createdAt")
    fun observeAll(): Flow<List<PlaylistEntity>>

    @Query("SELECT * FROM playlists ORDER BY createdAt")
    suspend fun getAll(): List<PlaylistEntity>

    @Query("SELECT * FROM playlists WHERE id = :id LIMIT 1")
    suspend fun get(id: Long): PlaylistEntity?

    @Query("SELECT COUNT(*) FROM playlists")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: PlaylistEntity): Long

    @Update
    suspend fun update(item: PlaylistEntity)

    @Delete
    suspend fun delete(item: PlaylistEntity)

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun deleteById(id: Long)
}
