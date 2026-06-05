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
    entities = [
        FavoriteEntity::class,
        RecentEntity::class,
        PlaylistEntity::class,
        CollectionEntity::class,
        CollectionItemEntity::class,
    ],
    version = 4,
    exportSchema = false,
)
abstract class IptvDatabase : RoomDatabase() {
    abstract fun favoriteDao(): FavoriteDao
    abstract fun recentDao(): RecentDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun collectionDao(): CollectionDao
    abstract fun collectionItemDao(): CollectionItemDao
}

val MIGRATION_3_4 = object : androidx.room.migration.Migration(3, 4) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS collections (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                createdAt INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS collection_items (
                collectionId INTEGER NOT NULL,
                channelId TEXT NOT NULL,
                name TEXT NOT NULL,
                streamUrl TEXT NOT NULL,
                logoUrl TEXT,
                kindOrdinal INTEGER NOT NULL,
                addedAt INTEGER NOT NULL,
                PRIMARY KEY(collectionId, channelId)
            )
            """.trimIndent()
        )
    }
}

val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                m3uUrl TEXT,
                epgUrl TEXT,
                xServer TEXT,
                xUser TEXT,
                xPass TEXT,
                createdAt INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }
}
