package com.iptv.player.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "collections")
data class CollectionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "collection_items", primaryKeys = ["collectionId", "channelId"])
data class CollectionItemEntity(
    val collectionId: Long,
    val channelId: String,
    val name: String,
    val streamUrl: String,
    val logoUrl: String?,
    val kindOrdinal: Int,
    val addedAt: Long = System.currentTimeMillis(),
)

@Dao
interface CollectionDao {
    @Query("SELECT * FROM collections ORDER BY createdAt")
    fun observeAll(): Flow<List<CollectionEntity>>

    @Insert
    suspend fun insert(c: CollectionEntity): Long

    @Query("UPDATE collections SET name = :name WHERE id = :id")
    suspend fun rename(id: Long, name: String)

    @Query("DELETE FROM collections WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface CollectionItemDao {
    @Query("SELECT * FROM collection_items ORDER BY addedAt")
    fun observeAll(): Flow<List<CollectionItemEntity>>

    @Query("SELECT * FROM collection_items WHERE collectionId = :id ORDER BY addedAt")
    fun observeItems(id: Long): Flow<List<CollectionItemEntity>>

    @Query("SELECT collectionId FROM collection_items WHERE channelId = :channelId")
    fun observeCollectionsFor(channelId: String): Flow<List<Long>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun add(item: CollectionItemEntity)

    @Query("DELETE FROM collection_items WHERE collectionId = :cid AND channelId = :ch")
    suspend fun remove(cid: Long, ch: String)

    @Query("DELETE FROM collection_items WHERE collectionId = :cid")
    suspend fun clearCollection(cid: Long)
}
