package com.iptv.player.data.parser

import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.MediaKind

object M3uParser {

    private val attrRegex = Regex("""([a-zA-Z0-9\-]+)="([^"]*)"""")

    fun parse(text: String): List<Channel> {
        val lines = text.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()

        if (lines.isEmpty() || !lines.first().startsWith("#EXTM3U")) {
            return emptyList()
        }

        val result = mutableListOf<Channel>()
        var pendingName: String? = null
        var pendingAttrs: Map<String, String> = emptyMap()
        var index = 0

        for (line in lines) {
            when {
                line.startsWith("#EXTINF", ignoreCase = true) -> {
                    val commaAt = line.indexOf(',')
                    pendingName = if (commaAt >= 0) line.substring(commaAt + 1).trim() else "Canal"
                    val header = if (commaAt >= 0) line.substring(0, commaAt) else line
                    pendingAttrs = attrRegex.findAll(header).associate {
                        it.groupValues[1].lowercase() to it.groupValues[2]
                    }
                }
                line.startsWith("#") -> { /* skip other directives */ }
                pendingName != null -> {
                    val attrs = pendingAttrs
                    val name = pendingName ?: "Canal"
                    val tvgId = attrs["tvg-id"]?.takeIf { it.isNotBlank() }
                    val logo = attrs["tvg-logo"]?.takeIf { it.isNotBlank() }
                    val group = attrs["group-title"]?.takeIf { it.isNotBlank() }
                    val kind = inferKind(line, group)
                    result.add(
                        Channel(
                            id = "m3u-${index++}-${line.hashCode()}",
                            name = name,
                            streamUrl = line,
                            logoUrl = logo,
                            groupTitle = group,
                            tvgId = tvgId,
                            kind = kind,
                        )
                    )
                    pendingName = null
                    pendingAttrs = emptyMap()
                }
            }
        }
        return result
    }

    private fun inferKind(url: String, group: String?): MediaKind {
        val u = url.lowercase()
        val g = group?.lowercase().orEmpty()
        return when {
            "/series/" in u || "series" in g -> MediaKind.SERIES_EPISODE
            "/movie/" in u || "vod" in g || "movie" in g || "pel" in g || "film" in g -> MediaKind.MOVIE
            else -> MediaKind.LIVE
        }
    }
}
