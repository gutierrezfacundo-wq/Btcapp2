package com.iptv.player.di

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.room.Room
import com.iptv.player.data.local.IptvDatabase
import com.iptv.player.data.local.PreferencesStore
import com.iptv.player.data.remote.XtreamApi
import com.iptv.player.data.repository.CatalogCache
import com.iptv.player.data.repository.CollectionRepository
import com.iptv.player.data.repository.EpgRepository
import com.iptv.player.data.repository.IptvRepository
import com.iptv.player.data.repository.PlaylistRepository
import com.iptv.player.playback.PlaybackController
import com.iptv.player.playback.PlaybackManager
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

@OptIn(UnstableApi::class)
class AppContainer(context: Context) {

    val appContext: Context = context.applicationContext

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl("https://placeholder.invalid/")
        .client(httpClient)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    val xtreamApi: XtreamApi = retrofit.create(XtreamApi::class.java)
    val xtreamStreamClient = com.iptv.player.data.remote.XtreamStreamClient(httpClient, json)

    val database: IptvDatabase = Room.databaseBuilder(
        appContext,
        IptvDatabase::class.java,
        "iptv.db",
    )
        .addMigrations(
            com.iptv.player.data.local.MIGRATION_2_3,
            com.iptv.player.data.local.MIGRATION_3_4,
            com.iptv.player.data.local.MIGRATION_4_5,
        )
        .fallbackToDestructiveMigration()
        .build()

    val preferencesStore = PreferencesStore(appContext)
    val iptvRepository = IptvRepository(xtreamApi, xtreamStreamClient, httpClient)
    val epgRepository = EpgRepository(httpClient)
    val catalogCache = CatalogCache(appContext)
    val playlistRepository = PlaylistRepository(database.playlistDao(), preferencesStore)
    val collectionRepository = CollectionRepository(
        database.collectionDao(),
        database.collectionItemDao(),
    )
    val playbackController = PlaybackController()
    val playbackManager = PlaybackManager(appContext, httpClient)
}
