package com.iptv.player.ui.player

import android.app.Activity
import android.content.res.Configuration
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Fullscreen
import androidx.compose.material.icons.outlined.FullscreenExit
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.PictureInPicture
import androidx.compose.material.icons.outlined.SkipNext
import androidx.compose.material.icons.outlined.SkipPrevious
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.ViewList
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.iptv.player.data.model.Channel
import com.iptv.player.data.model.EpgProgram
import com.iptv.player.di.AppContainer
import com.iptv.player.playback.PlaybackQueue
import com.iptv.player.ui.LocalEnterPip
import com.iptv.player.ui.LocalIsInPipMode
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class, UnstableApi::class)
@Composable
fun PlayerScreen(
    container: AppContainer,
    streamUrl: String,
    title: String,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val vm: PlayerViewModel = viewModel(factory = PlayerViewModel.Factory(container))
    val player = vm.player
    val queue by vm.queue.collectAsStateWithLifecycle()
    val epg by vm.epg.collectAsStateWithLifecycle()
    val isInPip = LocalIsInPipMode.current
    val enterPip = LocalEnterPip.current

    LaunchedEffect(streamUrl, title) {
        if (queue == null) {
            container.playbackController.setSingle(title, streamUrl, null)
        }
    }

    LaunchedEffect(queue) {
        queue?.let { vm.applyQueue(it) }
    }

    DisposableEffect(Unit) {
        vm.setPlayerVisible(true)
        onDispose { vm.setPlayerVisible(false) }
    }

    var isFullscreen by rememberSaveable { mutableStateOf(false) }
    var listOpenLandscape by rememberSaveable { mutableStateOf(true) }
    var miniEpgVisible by remember { mutableStateOf(false) }
    var lastChannelId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(queue) {
        val curId = (queue as? PlaybackQueue.Live)?.active?.id
        if (curId != null && curId != lastChannelId) {
            val firstShow = lastChannelId == null
            lastChannelId = curId
            if (!firstShow) {
                miniEpgVisible = true
                delay(3500)
                miniEpgVisible = false
            }
        }
    }

    val orientation = LocalConfiguration.current.orientation
    val isLandscape = orientation == Configuration.ORIENTATION_LANDSCAPE

    BackHandler {
        when {
            isFullscreen -> isFullscreen = false
            isLandscape && listOpenLandscape -> listOpenLandscape = false
            else -> onBack()
        }
    }

    val activity = context as? Activity
    SystemBarsEffect(activity = activity, hidden = isFullscreen || isInPip)
    val titleText = queue?.title ?: title
    var showTrackSelector by remember { mutableStateOf(false) }
    val live = queue as? PlaybackQueue.Live

    when {
        isInPip -> Box(Modifier.fillMaxSize().background(Color.Black)) {
            PlayerSurface(player, Modifier.fillMaxSize(), controllerEnabled = false)
        }
        isFullscreen -> FullscreenLayout(
            player = player,
            titleText = titleText,
            onExit = { isFullscreen = false },
            onBack = onBack,
            onOpenTracks = { showTrackSelector = true },
            onEnterPip = enterPip,
            onPrev = { vm.previous() },
            onNext = { vm.next() },
            showNav = live != null,
            miniEpgVisible = miniEpgVisible,
            epgNow = epg.now,
            epgNext = epg.next,
            channelName = live?.active?.name,
        )
        isLandscape -> LandscapeOverlayLayout(
            player = player,
            titleText = titleText,
            onBack = onBack,
            onOpenTracks = { showTrackSelector = true },
            onEnterPip = enterPip,
            onEnterFullscreen = { isFullscreen = true },
            onToggleList = { listOpenLandscape = !listOpenLandscape },
            onPrev = { vm.previous() },
            onNext = { vm.next() },
            live = live,
            listOpen = listOpenLandscape,
            onSelectChannel = { vm.selectIndex(it) },
            miniEpgVisible = miniEpgVisible,
            epgNow = epg.now,
            epgNext = epg.next,
            channelName = live?.active?.name,
        )
        else -> PortraitLayout(
            player = player,
            titleText = titleText,
            onBack = onBack,
            onOpenTracks = { showTrackSelector = true },
            onEnterPip = enterPip,
            onEnterFullscreen = { isFullscreen = true },
            epgNow = epg.now,
            epgNext = epg.next,
            live = live,
            onSelectChannel = { vm.selectIndex(it) },
        )
    }

    if (showTrackSelector) {
        TrackSelectorSheet(player, onDismiss = { showTrackSelector = false })
    }
}

@Composable
private fun SystemBarsEffect(activity: Activity?, hidden: Boolean) {
    LaunchedEffect(hidden) {
        val window = activity?.window ?: return@LaunchedEffect
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (hidden) {
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }
    DisposableEffect(activity) {
        onDispose {
            val window = activity?.window ?: return@onDispose
            WindowCompat.getInsetsController(window, window.decorView)
                .show(WindowInsetsCompat.Type.systemBars())
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, UnstableApi::class)
@Composable
private fun PortraitLayout(
    player: ExoPlayer,
    titleText: String,
    onBack: () -> Unit,
    onOpenTracks: () -> Unit,
    onEnterPip: () -> Unit,
    onEnterFullscreen: () -> Unit,
    epgNow: EpgProgram?,
    epgNext: EpgProgram?,
    live: PlaybackQueue.Live?,
    onSelectChannel: (Int) -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(titleText, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Volver", tint = Color.White)
                    }
                },
                actions = {
                    IconButton(onClick = onEnterFullscreen) {
                        Icon(Icons.Outlined.Fullscreen, "Pantalla completa", tint = Color.White)
                    }
                    IconButton(onClick = onOpenTracks) {
                        Icon(Icons.Outlined.Tune, "Pistas", tint = Color.White)
                    }
                    IconButton(onClick = onEnterPip) {
                        Icon(Icons.Outlined.PictureInPicture, "PiP", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Black),
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            PlayerSurface(
                player = player,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .background(Color.Black),
            )
            EpgBar(now = epgNow, next = epgNext)
            if (live != null) {
                CompactChannelList(
                    channels = live.channels,
                    activeIndex = live.activeIndex,
                    onSelect = onSelectChannel,
                )
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun LandscapeOverlayLayout(
    player: ExoPlayer,
    titleText: String,
    onBack: () -> Unit,
    onOpenTracks: () -> Unit,
    onEnterPip: () -> Unit,
    onEnterFullscreen: () -> Unit,
    onToggleList: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    live: PlaybackQueue.Live?,
    listOpen: Boolean,
    onSelectChannel: (Int) -> Unit,
    miniEpgVisible: Boolean,
    epgNow: EpgProgram?,
    epgNext: EpgProgram?,
    channelName: String?,
) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        PlayerSurface(player, Modifier.fillMaxSize())
        OverlayBar(
            titleText = titleText,
            showNav = live != null,
            showListToggle = live != null,
            onBack = onBack,
            onPrev = onPrev,
            onNext = onNext,
            onOpenTracks = onOpenTracks,
            onEnterPip = onEnterPip,
            onEnterFullscreen = onEnterFullscreen,
            onToggleList = onToggleList,
        )
        if (live != null) {
            AnimatedVisibility(
                visible = listOpen,
                enter = slideInHorizontally(initialOffsetX = { it }),
                exit = slideOutHorizontally(targetOffsetX = { it }),
                modifier = Modifier.align(Alignment.CenterEnd),
            ) {
                Surface(
                    modifier = Modifier.fillMaxHeight().width(320.dp),
                    color = MaterialTheme.colorScheme.background.copy(alpha = 0.93f),
                    tonalElevation = 6.dp,
                ) {
                    Column(modifier = Modifier.windowInsetsPadding(WindowInsets.systemBars)) {
                        Spacer(Modifier.size(56.dp))
                        CompactChannelList(
                            channels = live.channels,
                            activeIndex = live.activeIndex,
                            onSelect = onSelectChannel,
                        )
                    }
                }
            }
        }
        AnimatedVisibility(
            visible = miniEpgVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomStart).padding(16.dp),
        ) {
            MiniEpgCard(channelName, epgNow, epgNext)
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun FullscreenLayout(
    player: ExoPlayer,
    titleText: String,
    onExit: () -> Unit,
    onBack: () -> Unit,
    onOpenTracks: () -> Unit,
    onEnterPip: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    showNav: Boolean,
    miniEpgVisible: Boolean,
    epgNow: EpgProgram?,
    epgNext: EpgProgram?,
    channelName: String?,
) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        PlayerSurface(player, Modifier.fillMaxSize())
        OverlayBar(
            titleText = titleText,
            showNav = showNav,
            showListToggle = false,
            onBack = onBack,
            onPrev = onPrev,
            onNext = onNext,
            onOpenTracks = onOpenTracks,
            onEnterPip = onEnterPip,
            onEnterFullscreen = onExit,
            onToggleList = {},
            fullscreenIcon = Icons.Outlined.FullscreenExit,
            fullscreenContentDesc = "Salir de pantalla completa",
        )
        AnimatedVisibility(
            visible = miniEpgVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomStart).padding(16.dp),
        ) {
            MiniEpgCard(channelName, epgNow, epgNext)
        }
    }
}

@Composable
private fun OverlayBar(
    titleText: String,
    showNav: Boolean,
    showListToggle: Boolean,
    onBack: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onOpenTracks: () -> Unit,
    onEnterPip: () -> Unit,
    onEnterFullscreen: () -> Unit,
    onToggleList: () -> Unit,
    fullscreenIcon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Outlined.Fullscreen,
    fullscreenContentDesc: String = "Pantalla completa",
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.45f))
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Volver", tint = Color.White)
        }
        Text(
            titleText,
            color = Color.White,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(start = 4.dp),
        )
        if (showNav) {
            IconButton(onClick = onPrev) {
                Icon(Icons.Outlined.SkipPrevious, "Anterior", tint = Color.White)
            }
            IconButton(onClick = onNext) {
                Icon(Icons.Outlined.SkipNext, "Siguiente", tint = Color.White)
            }
        }
        if (showListToggle) {
            IconButton(onClick = onToggleList) {
                Icon(Icons.Outlined.ViewList, "Mostrar/ocultar lista", tint = Color.White)
            }
        }
        IconButton(onClick = onOpenTracks) {
            Icon(Icons.Outlined.Tune, "Pistas", tint = Color.White)
        }
        IconButton(onClick = onEnterPip) {
            Icon(Icons.Outlined.PictureInPicture, "PiP", tint = Color.White)
        }
        IconButton(onClick = onEnterFullscreen) {
            Icon(fullscreenIcon, fullscreenContentDesc, tint = Color.White)
        }
    }
}

@Composable
private fun MiniEpgCard(channelName: String?, now: EpgProgram?, next: EpgProgram?) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = Color.Black.copy(alpha = 0.78f),
        tonalElevation = 4.dp,
        modifier = Modifier.width(360.dp),
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            if (!channelName.isNullOrBlank()) {
                Text(
                    channelName,
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.size(4.dp))
            }
            if (now != null) {
                Text(
                    "AHORA",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelSmall,
                )
                Text(
                    now.title,
                    color = Color.White,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (next != null) {
                Spacer(Modifier.size(4.dp))
                Text(
                    "DESPUÉS",
                    color = Color.White.copy(alpha = 0.6f),
                    style = MaterialTheme.typography.labelSmall,
                )
                Text(
                    next.title,
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun PlayerSurface(
    player: ExoPlayer,
    modifier: Modifier = Modifier,
    controllerEnabled: Boolean = true,
) {
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                useController = controllerEnabled
                setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
            }
        },
        update = { view ->
            view.player = player
            view.useController = controllerEnabled
        },
    )
}

@Composable
private fun CompactChannelList(
    channels: List<Channel>,
    activeIndex: Int,
    onSelect: (Int) -> Unit,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(activeIndex, channels.size) {
        if (activeIndex in channels.indices) {
            listState.animateScrollToItem(activeIndex.coerceAtLeast(0))
        }
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 4.dp),
    ) {
        itemsIndexed(channels, key = { _, ch -> ch.id }) { idx, ch ->
            CompactChannelRow(channel = ch, isActive = idx == activeIndex, onClick = { onSelect(idx) })
        }
    }
}

@Composable
private fun CompactChannelRow(channel: Channel, isActive: Boolean, onClick: () -> Unit) {
    val bg = if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else Color.Transparent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Color(0xFF222226)),
            contentAlignment = Alignment.Center,
        ) {
            if (!channel.logoUrl.isNullOrBlank()) {
                AsyncImage(
                    model = channel.logoUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(Icons.Outlined.LiveTv, null, tint = Color.White)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
            Text(
                channel.name,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            channel.groupTitle?.takeIf { it.isNotBlank() }?.let { sub ->
                Text(
                    sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (isActive) {
            Box(
                Modifier
                    .size(8.dp)
                    .clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.primary),
            )
            Spacer(Modifier.width(4.dp))
        }
    }
}
