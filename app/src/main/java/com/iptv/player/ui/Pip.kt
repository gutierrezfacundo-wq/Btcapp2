package com.iptv.player.ui

import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.staticCompositionLocalOf

val LocalIsInPipMode = compositionLocalOf { false }
val LocalEnterPip = staticCompositionLocalOf<() -> Unit> { {} }
