package com.iptv.player.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** Preferencias por canal: ocultar, renombrar, numero personalizado. */
@Entity(tableName = "channel_prefs")
data class ChannelPrefEntity(
    @PrimaryKey val channelId: String,
    val hidden: Boolean = false,
    val customName: String? = null,
    val customNumber: Int? = null,
)

/** Categorias ocultas (por nombre de grupo). */
@Entity(tableName = "category_prefs")
data class CategoryPrefEntity(
    @PrimaryKey val name: String,
    val hidden: Boolean = false,
)

/** Mapeo manual canal -> id de guia XMLTV. */
@Entity(tableName = "epg_maps")
data class EpgMapEntity(
    @PrimaryKey val channelId: String,
    val tvgId: String,
)

@Dao
interface ChannelPrefDao {
    @Query("SELECT * FROM channel_prefs")
    fun observeAll(): Flow<List<ChannelPrefEntity>>

    @Query("SELECT * FROM channel_prefs WHERE channelId = :id LIMIT 1")
    suspend fun get(id: String): ChannelPrefEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(pref: ChannelPrefEntity)

    @Query("DELETE FROM channel_prefs WHERE channelId = :id")
    suspend fun delete(id: String)
}

@Dao
interface CategoryPrefDao {
    @Query("SELECT * FROM category_prefs WHERE hidden = 1")
    fun observeHidden(): Flow<List<CategoryPrefEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(pref: CategoryPrefEntity)

    @Query("DELETE FROM category_prefs WHERE name = :name")
    suspend fun delete(name: String)
}

@Dao
interface EpgMapDao {
    @Query("SELECT * FROM epg_maps")
    fun observeAll(): Flow<List<EpgMapEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(map: EpgMapEntity)

    @Query("DELETE FROM epg_maps WHERE channelId = :channelId")
    suspend fun delete(channelId: String)
}
