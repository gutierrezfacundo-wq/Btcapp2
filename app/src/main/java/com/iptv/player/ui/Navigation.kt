package com.iptv.player.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.iptv.player.di.AppContainer
import com.iptv.player.ui.home.HomeScreen
import com.iptv.player.ui.player.PlayerScreen
import com.iptv.player.ui.playlists.PlaylistsScreen
import com.iptv.player.ui.series.SeriesDetailScreen
import com.iptv.player.ui.setup.SetupScreen
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object Routes {
    const val Setup = "setup?editId={editId}"
    const val Home = "home"
    const val Playlists = "playlists"
    const val Player = "player/{url}/{title}"
    const val SeriesDetail = "series/{seriesId}/{title}"

    fun setup(editId: Long? = null): String =
        if (editId == null) "setup?editId=" else "setup?editId=$editId"

    fun player(url: String, title: String): String {
        val u = URLEncoder.encode(url, StandardCharsets.UTF_8.name())
        val t = URLEncoder.encode(title, StandardCharsets.UTF_8.name())
        return "player/$u/$t"
    }

    fun seriesDetail(seriesId: String, title: String): String {
        val t = URLEncoder.encode(title, StandardCharsets.UTF_8.name())
        return "series/$seriesId/$t"
    }
}

@Composable
fun AppNavGraph(
    navController: NavHostController,
    container: AppContainer,
    hasSource: Boolean,
) {
    val start = if (hasSource) Routes.Home else Routes.setup()
    NavHost(navController = navController, startDestination = start) {
        composable(
            route = Routes.Setup,
            arguments = listOf(
                navArgument("editId") {
                    type = NavType.StringType
                    defaultValue = ""
                    nullable = true
                },
            ),
        ) { entry ->
            val raw = entry.arguments?.getString("editId").orEmpty()
            val editId = raw.toLongOrNull()
            SetupScreen(
                container = container,
                onSaved = {
                    val popped = navController.popBackStack()
                    if (!popped) {
                        navController.navigate(Routes.Home) {
                            popUpTo(Routes.Setup) { inclusive = true }
                        }
                    }
                },
                onBack = if (editId != null) ({ navController.popBackStack() }) else null,
                editingId = editId,
            )
        }
        composable(Routes.Home) {
            HomeScreen(
                container = container,
                onPlay = { url, title -> navController.navigate(Routes.player(url, title)) },
                onOpenSeries = { id, title -> navController.navigate(Routes.seriesDetail(id, title)) },
                onOpenPlaylists = { navController.navigate(Routes.Playlists) },
            )
        }
        composable(Routes.Playlists) {
            PlaylistsScreen(
                container = container,
                onAddNew = { navController.navigate(Routes.setup()) },
                onEdit = { id -> navController.navigate(Routes.setup(id)) },
                onBack = { navController.popBackStack() },
            )
        }
        composable(
            route = Routes.Player,
            arguments = listOf(
                navArgument("url") { type = NavType.StringType },
                navArgument("title") { type = NavType.StringType },
            ),
        ) { entry ->
            val rawUrl = entry.arguments?.getString("url").orEmpty()
            val rawTitle = entry.arguments?.getString("title").orEmpty()
            val url = URLDecoder.decode(rawUrl, StandardCharsets.UTF_8.name())
            val title = URLDecoder.decode(rawTitle, StandardCharsets.UTF_8.name())
            PlayerScreen(
                container = container,
                streamUrl = url,
                title = title,
                onBack = {
                    val popped = navController.popBackStack()
                    if (!popped) {
                        navController.navigate(Routes.Home) {
                            popUpTo(Routes.Player) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                },
            )
        }
        composable(
            route = Routes.SeriesDetail,
            arguments = listOf(
                navArgument("seriesId") { type = NavType.StringType },
                navArgument("title") { type = NavType.StringType },
            ),
        ) { entry ->
            val id = entry.arguments?.getString("seriesId").orEmpty()
            val rawTitle = entry.arguments?.getString("title").orEmpty()
            val title = URLDecoder.decode(rawTitle, StandardCharsets.UTF_8.name())
            SeriesDetailScreen(
                container = container,
                seriesId = id,
                title = title,
                onPlay = { url, episodeTitle ->
                    navController.navigate(Routes.player(url, episodeTitle))
                },
                onBack = { navController.popBackStack() },
            )
        }
    }
}
