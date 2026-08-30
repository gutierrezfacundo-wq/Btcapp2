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
        ChannelPrefEntity::class,
        CategoryPrefEntity::class,
        EpgMapEntity::class,
    ],
    version = 5,
    exportSchema = false,
)
abstract class IptvDatabase : RoomDatabase() {
    abstract fun favoriteDao(): FavoriteDao
    abstract fun recentDao(): RecentDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun collectionDao(): CollectionDao
    abstract fun collectionItemDao(): CollectionItemDao
    abstract fun channelPrefDao(): ChannelPrefDao
    abstract fun categoryPrefDao(): CategoryPrefDao
    abstract fun epgMapDao(): EpgMapDao
}

val MIGRATION_4_5 = object : androidx.room.migration.Migration(4, 5) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS channel_prefs (
                channelId TEXT NOT NULL PRIMARY KEY,
                hidden INTEGER NOT NULL DEFAULT 0,
                customName TEXT,
                customNumber INTEGER
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS category_prefs (
                name TEXT NOT NULL PRIMARY KEY,
                hidden INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS epg_maps (
                channelId TEXT NOT NULL PRIMARY KEY,
                tvgId TEXT NOT NULL
            )
            """.trimIndent()
        )
    }
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
