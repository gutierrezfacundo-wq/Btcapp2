package com.iptv.player.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "recents")
data class RecentEntity(
    @PrimaryKey val streamUrl: String,
    val title: String,
    val logoUrl: String?,
    val kindOrdinal: Int,
    val positionMs: Long,
    val durationMs: Long,
    val lastPlayedAt: Long,
)

@Dao
interface RecentDao {
    @Query("SELECT * FROM recents ORDER BY lastPlayedAt DESC LIMIT 30")
    fun observeRecent(): Flow<List<RecentEntity>>

    @Query("SELECT * FROM recents WHERE streamUrl = :url LIMIT 1")
    suspend fun get(url: String): RecentEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: RecentEntity)

    @Query("DELETE FROM recents WHERE streamUrl = :url")
    suspend fun remove(url: String)

    @Query("DELETE FROM recents")
    suspend fun clear()
}

@Database(
    entities = [FavoriteEntity::class, RecentEntity::class],
    version = 2,
    exportSchema = false,
)
abstract class IptvDatabase : RoomDatabase() {
    abstract fun favoriteDao(): FavoriteDao
    abstract fun recentDao(): RecentDao
}
