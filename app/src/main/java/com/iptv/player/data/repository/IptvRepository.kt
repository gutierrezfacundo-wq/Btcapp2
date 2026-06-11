package com.iptv.player.data.repository

import com.iptv.player.data.model.Category
import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.Episode
import com.iptv.player.data.model.MediaKind
import com.iptv.player.data.model.Movie
import com.iptv.player.data.model.SeriesInfo
import com.iptv.player.data.model.SourceConfig
import com.iptv.player.data.parser.M3uParser
import com.iptv.player.data.remote.XtreamApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

@kotlinx.serialization.Serializable
data class Catalog(
    val liveChannels: List<Channel> = emptyList(),
    val liveCategories: List<Category> = emptyList(),
    val movies: List<Movie> = emptyList(),
    val movieCategories: List<Category> = emptyList(),
    val series: List<SeriesInfo> = emptyList(),
    val seriesCategories: List<Category> = emptyList(),
)

class IptvRepository(
    private val xtreamApi: XtreamApi,
    private val xtreamStreamClient: com.iptv.player.data.remote.XtreamStreamClient,
    private val httpClient: OkHttpClient,
) {
    suspend fun loadCatalog(source: SourceConfig): Catalog = when (source) {
        is SourceConfig.M3u -> loadFromM3u(source)
        is SourceConfig.Xtream -> loadFromXtream(source)
    }

    private suspend fun loadFromM3u(source: SourceConfig.M3u): Catalog = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(source.playlistUrl).build()
        val body = httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) error("HTTP ${resp.code} al obtener la lista")
            resp.body?.string().orEmpty()
        }
        val items = M3uParser.parse(body)
        val live = items.filter { it.kind == MediaKind.LIVE }
        val movies = items.filter { it.kind == MediaKind.MOVIE }.map { it.toMovie() }
        val series = items.filter { it.kind == MediaKind.SERIES_EPISODE }.map { it.toSeriesInfo() }

        Catalog(
            liveChannels = live,
            liveCategories = live.groupCategories(),
            movies = movies,
            movieCategories = movies.mapNotNull { it.category }.distinct().map { Category(it, it) },
            series = series,
            seriesCategories = series.mapNotNull { it.category }.distinct().map { Category(it, it) },
        )
    }

    private fun Channel.toMovie() = Movie(id, name, streamUrl, logoUrl, groupTitle)
    private fun Channel.toSeriesInfo() = SeriesInfo(id, name, logoUrl, groupTitle)

    private fun List<Channel>.groupCategories(): List<Category> =
        mapNotNull { it.groupTitle }.distinct().sorted().map { Category(it, it) }

    private suspend fun loadFromXtream(s: SourceConfig.Xtream): Catalog = withContext(Dispatchers.IO) {
        // Usamos el stream client (parsea JSON sin cargar todo a memoria) para evitar
        // OutOfMemoryError en portales con catalogos grandes.
        val base = s.playerApi()
        val liveCats = xtreamStreamClient.liveCategories(base).toCategories()
        val liveStreams = xtreamStreamClient.liveStreams(base).map { dto ->
            Channel(
                id = "xt-live-${dto.streamId}",
                name = dto.name,
                streamUrl = s.streamLive(dto.streamId),
                logoUrl = dto.streamIcon,
                groupTitle = liveCats.firstOrNull { it.id == dto.categoryId }?.name,
                tvgId = dto.epgChannelId,
                archiveDays = if (dto.tvArchive == 1) dto.tvArchiveDuration else 0,
                xtreamStreamId = dto.streamId,
            )
        }
        val vodCats = xtreamStreamClient.vodCategories(base).toCategories()
        val movies = xtreamStreamClient.vodStreams(base).map { dto ->
            Movie(
                id = "xt-vod-${dto.streamId}",
                name = dto.name,
                streamUrl = s.streamMovie(dto.streamId, dto.containerExtension ?: "mp4"),
                posterUrl = dto.streamIcon,
                category = vodCats.firstOrNull { it.id == dto.categoryId }?.name,
                rating = dto.rating,
                year = dto.releaseDate,
                plot = dto.plot,
            )
        }
        val seriesCats = xtreamStreamClient.seriesCategories(base).toCategories()
        val series = xtreamStreamClient.series(base).map { dto ->
            SeriesInfo(
                id = dto.seriesId.toString(),
                name = dto.name,
                posterUrl = dto.cover,
                category = seriesCats.firstOrNull { it.id == dto.categoryId }?.name,
                plot = dto.plot,
            )
        }
        Catalog(
            liveChannels = liveStreams,
            liveCategories = liveCats,
            movies = movies,
            movieCategories = vodCats,
            series = series,
            seriesCategories = seriesCats,
        )
    }

    suspend fun seriesEpisodes(source: SourceConfig.Xtream, seriesId: Int): List<Episode> =
        withContext(Dispatchers.IO) {
            val info = xtreamStreamClient.seriesInfo(source.playerApi(), seriesId = seriesId)
            info.episodes.flatMap { (seasonKey, episodes) ->
                val season = seasonKey.toIntOrNull() ?: 0
                episodes.map { e ->
                    Episode(
                        id = "xt-series-${seriesId}-${e.id}",
                        seriesId = seriesId.toString(),
                        seasonNumber = e.season ?: season,
                        episodeNumber = e.episodeNum ?: 0,
                        title = e.title,
                        streamUrl = source.streamSeries(e.id.toIntOrNull() ?: 0, e.containerExtension ?: "mp4"),
                    )
                }
            }.sortedWith(compareBy({ it.seasonNumber }, { it.episodeNumber }))
        }

    private fun List<com.iptv.player.data.remote.XtreamCategoryDto>.toCategories(): List<Category> =
        map { Category(it.categoryId, it.categoryName) }
}
