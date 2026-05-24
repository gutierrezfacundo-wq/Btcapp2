package com.iptv.player

import android.app.Application
import com.iptv.player.crash.installCrashHandler
import com.iptv.player.di.AppContainer

class IptvApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        installCrashHandler(this)
        container = AppContainer(this)
    }
}
