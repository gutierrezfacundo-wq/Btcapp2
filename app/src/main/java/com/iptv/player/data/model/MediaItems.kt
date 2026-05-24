package com.iptv.player.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class MediaKind { LIVE, MOVIE, SERIES_EPISODE }

@Serializable
data class Channel(
    val id: String,
    val name: String,
    val streamUrl: String,
    val logoUrl: String?,
    val groupTitle: String?,
    val tvgId: String?,
    val kind: MediaKind = MediaKind.LIVE,
)

@Serializable
data class Movie(
    val id: String,
    val name: String,
    val streamUrl: String,
    val posterUrl: String?,
    val category: String?,
    val plot: String? = null,
    val rating: String? = null,
    val year: String? = null,
)

@Serializable
data class SeriesInfo(
    val id: String,
    val name: String,
    val posterUrl: String?,
    val category: String?,
    val plot: String? = null,
)

data class Episode(
    val id: String,
    val seriesId: String,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val title: String,
    val streamUrl: String,
    val plot: String? = null,
)

@Serializable
data class Category(
    val id: String,
    val name: String,
)

data class EpgProgram(
    val channelTvgId: String,
    val title: String,
    val description: String?,
    val startEpochMs: Long,
    val stopEpochMs: Long,
)
