package com.iptv.player

import android.app.Application
import com.iptv.player.crash.installCrashHandler
import com.iptv.player.di.AppContainer
import com.iptv.player.download.DownloadService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class IptvApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        installCrashHandler(this)
        container = AppContainer(this)

        // Descargas cortadas por un cierre de la app: vuelven a la cola y se
        // retoman (el archivo parcial se reanuda con Range).
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching {
                container.downloadRepository.requeueRunning()
                if (container.database.downloadDao().nextQueued() != null) {
                    DownloadService.start(this@IptvApp)
                }
            }
        }
    }
}
