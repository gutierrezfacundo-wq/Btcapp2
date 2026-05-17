package com.iptv.player.di

import android.content.Context
import androidx.room.Room
import com.iptv.player.data.local.IptvDatabase
import com.iptv.player.data.local.PreferencesStore
import com.iptv.player.data.remote.XtreamApi
import com.iptv.player.data.repository.EpgRepository
import com.iptv.player.data.repository.IptvRepository
import com.iptv.player.playback.PlaybackController
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

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

    val database: IptvDatabase = Room.databaseBuilder(
        appContext,
        IptvDatabase::class.java,
        "iptv.db",
    )
        .fallbackToDestructiveMigration()
        .build()

    val preferencesStore = PreferencesStore(appContext)
    val iptvRepository = IptvRepository(xtreamApi, httpClient)
    val epgRepository = EpgRepository(httpClient)
    val playbackController = PlaybackController()
}
