package com.iptv.player.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Cliente Xtream que parsea el JSON como stream — sin cargar toda la respuesta a memoria.
 * Necesario para portales con catalogos grandes (50+ MB) que reventaban Retrofit con
 * OutOfMemoryError al hacer .body.string() del response completo.
 */
class XtreamStreamClient(
    private val httpClient: OkHttpClient,
    private val json: Json,
) {
    @OptIn(ExperimentalSerializationApi::class)
    private suspend inline fun <reified T> fetch(url: String): T = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).build()
        httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) error("HTTP ${resp.code} en $url")
            val body = resp.body ?: error("Respuesta vacia de $url")
            body.byteStream().use { stream -> json.decodeFromStream<T>(stream) }
        }
    }

    suspend fun liveCategories(playerApiBase: String): List<XtreamCategoryDto> =
        fetch("$playerApiBase&action=get_live_categories")

    suspend fun liveStreams(playerApiBase: String): List<XtreamLiveStreamDto> =
        fetch("$playerApiBase&action=get_live_streams")

    suspend fun vodCategories(playerApiBase: String): List<XtreamCategoryDto> =
        fetch("$playerApiBase&action=get_vod_categories")

    suspend fun vodStreams(playerApiBase: String): List<XtreamMovieDto> =
        fetch("$playerApiBase&action=get_vod_streams")

    suspend fun seriesCategories(playerApiBase: String): List<XtreamCategoryDto> =
        fetch("$playerApiBase&action=get_series_categories")

    suspend fun series(playerApiBase: String): List<XtreamSeriesDto> =
        fetch("$playerApiBase&action=get_series")

    suspend fun seriesInfo(playerApiBase: String, seriesId: Int): XtreamSeriesInfoDto =
        fetch("$playerApiBase&action=get_series_info&series_id=$seriesId")
}
