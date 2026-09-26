package com.iptv.player.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class XtreamCategoryDto(
    @SerialName("category_id") val categoryId: String,
    @SerialName("category_name") val categoryName: String,
)

@Serializable
data class XtreamLiveStreamDto(
    @SerialName("stream_id") val streamId: Int,
    val name: String,
    @SerialName("stream_icon") val streamIcon: String? = null,
    @SerialName("epg_channel_id") val epgChannelId: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("tv_archive") val tvArchive: Int = 0,
    @SerialName("tv_archive_duration") val tvArchiveDuration: Int = 0,
)

@Serializable
data class XtreamMovieDto(
    @SerialName("stream_id") val streamId: Int,
    val name: String,
    @SerialName("stream_icon") val streamIcon: String? = null,
    @SerialName("container_extension") val containerExtension: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    val rating: String? = null,
    @SerialName("plot") val plot: String? = null,
    @SerialName("releaseDate") val releaseDate: String? = null,
)

@Serializable
data class XtreamSeriesDto(
    @SerialName("series_id") val seriesId: Int,
    val name: String,
    val cover: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    val plot: String? = null,
)

@Serializable
data class XtreamSeriesInfoDto(
    val info: XtreamSeriesInfoInfo? = null,
    val episodes: Map<String, List<XtreamEpisodeDto>> = emptyMap(),
)

@Serializable
data class XtreamSeriesInfoInfo(
    val name: String? = null,
    val cover: String? = null,
    val plot: String? = null,
)

@Serializable
data class XtreamEpisodeDto(
    val id: String,
    val title: String,
    @SerialName("container_extension") val containerExtension: String? = null,
    @SerialName("episode_num") val episodeNum: Int? = null,
    val season: Int? = null,
)
