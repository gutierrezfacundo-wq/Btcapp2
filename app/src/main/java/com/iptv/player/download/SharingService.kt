package com.iptv.player.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.iptv.player.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Mantiene viva la app mientras otro reproductor lee una descarga por el
 * servidor local.
 *
 * Sin esto, al pasar a segundo plano el sistema puede matar el proceso en
 * cualquier momento —en equipos con poca memoria, enseguida— y la película se
 * cortaría a la mitad. Con una notificación en curso, la app queda en primer
 * plano para el sistema.
 *
 * Se apaga sola cuando pasa un rato sin que el reproductor pida nada.
 */
class SharingService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var watchdog: Job? = null
    private var title: String = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            LocalMediaServer.clear()
            stopSelf()
            return START_NOT_STICKY
        }
        title = intent?.getStringExtra(EXTRA_TITLE).orEmpty()
        createChannel()
        val notif = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_ID,
                notif,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIF_ID, notif)
        }
        if (watchdog?.isActive != true) watchdog = scope.launch { watchIdle() }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        LocalMediaServer.clear()
        super.onDestroy()
    }

    /**
     * Si el reproductor no pide nada por un buen rato Y además cerró la
     * conexión, ya no hace falta seguir. Mirar solo el último pedido no
     * alcanzaba: con la película en pausa el reproductor no pide nada pero
     * mantiene la conexión abierta, y cortarle el servidor le mataba la
     * reproducción al volver.
     */
    private suspend fun watchIdle() {
        while (scope.isActive) {
            delay(60_000)
            val quietFor = System.currentTimeMillis() - LocalMediaServer.lastRequestAt
            val abandoned = LocalMediaServer.activeConnections == 0 && quietFor > IDLE_TIMEOUT_MS
            if (!LocalMediaServer.isPublishing || abandoned) {
                LocalMediaServer.clear()
                stopSelf()
                return
            }
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(NotificationManager::class.java)
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        mgr.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Compartir con otro reproductor", NotificationManager.IMPORTANCE_LOW)
                .apply {
                    description = "Mientras otro reproductor lee una descarga"
                    setShowBadge(false)
                }
        )
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle(title.ifBlank { "Compartiendo con otro reproductor" })
        .setContentText("Mantené esto mientras mirás. Tocá Listo al terminar.")
        .setSmallIcon(android.R.drawable.stat_sys_upload)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(
            PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        )
        .addAction(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Listo",
            PendingIntent.getService(
                this, 1,
                Intent(this, SharingService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        )
        .build()

    companion object {
        private const val CHANNEL_ID = "sharing"
        private const val NOTIF_ID = 4712
        private const val ACTION_STOP = "com.iptv.player.SHARING_STOP"
        private const val EXTRA_TITLE = "title"
        private const val IDLE_TIMEOUT_MS = 60 * 60 * 1000L

        fun start(context: Context, title: String) {
            val intent = Intent(context, SharingService::class.java).putExtra(EXTRA_TITLE, title)
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        }
    }
}
