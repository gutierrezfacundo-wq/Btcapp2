package com.iptv.player.data.model

sealed interface SourceConfig {
    data class M3u(val playlistUrl: String, val epgUrl: String? = null) : SourceConfig
    data class Xtream(
        val server: String,
        val username: String,
        val password: String,
    ) : SourceConfig {
        val portalBase: String get() = server.trimEnd('/')
        fun playerApi(path: String = "") =
            "$portalBase/player_api.php?username=$username&password=$password$path"
        fun streamLive(streamId: Int, ext: String = "ts") =
            "$portalBase/live/$username/$password/$streamId.$ext"
        fun streamMovie(streamId: Int, ext: String) =
            "$portalBase/movie/$username/$password/$streamId.$ext"
        fun streamSeries(episodeId: Int, ext: String) =
            "$portalBase/series/$username/$password/$episodeId.$ext"
        val xmltvUrl: String get() = "$portalBase/xmltv.php?username=$username&password=$password"

        /** URL de catch-up: reproduce un programa ya emitido del archivo del proveedor. */
        fun streamTimeshift(streamId: Int, startEpochMs: Long, durationMinutes: Int): String {
            val fmt = java.text.SimpleDateFormat("yyyy-MM-dd:HH-mm", java.util.Locale.US)
            val start = fmt.format(java.util.Date(startEpochMs))
            return "$portalBase/streaming/timeshift.php?username=$username&password=$password" +
                "&stream=$streamId&start=$start&duration=$durationMinutes"
        }
    }
}
