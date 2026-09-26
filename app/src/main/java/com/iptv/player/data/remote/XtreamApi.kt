package com.iptv.player.data.remote

import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.Url

interface XtreamApi {
    @GET
    suspend fun liveCategories(
        @Url url: String,
        @Query("action") action: String = "get_live_categories",
    ): List<XtreamCategoryDto>

    @GET
    suspend fun liveStreams(
        @Url url: String,
        @Query("action") action: String = "get_live_streams",
    ): List<XtreamLiveStreamDto>

    @GET
    suspend fun vodCategories(
        @Url url: String,
        @Query("action") action: String = "get_vod_categories",
    ): List<XtreamCategoryDto>

    @GET
    suspend fun vodStreams(
        @Url url: String,
        @Query("action") action: String = "get_vod_streams",
    ): List<XtreamMovieDto>

    @GET
    suspend fun seriesCategories(
        @Url url: String,
        @Query("action") action: String = "get_series_categories",
    ): List<XtreamCategoryDto>

    @GET
    suspend fun series(
        @Url url: String,
        @Query("action") action: String = "get_series",
    ): List<XtreamSeriesDto>

    @GET
    suspend fun seriesInfo(
        @Url url: String,
        @Query("action") action: String = "get_series_info",
        @Query("series_id") seriesId: Int,
    ): XtreamSeriesInfoDto
}
