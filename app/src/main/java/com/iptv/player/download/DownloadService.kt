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
import com.iptv.player.IptvApp
import com.iptv.player.MainActivity
import com.iptv.player.data.local.DownloadEntity
import com.iptv.player.data.local.DownloadStatus
import com.iptv.player.data.repository.DownloadRepository
import com.iptv.player.data.repository.formatBytes
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.RandomAccessFile

/**
 * Descarga el contenido encolado, UNO POR VEZ.
 *
 * La cola es secuencial a propósito: cada descarga consume una conexión de la
 * cuenta del proveedor (igual que reproducir), y los paneles Xtream con límite
 * cortan streams cuando se pasan. Con una sola en curso, el usuario puede
 * seguir mirando algo mientras baja otra cosa (si su plan permite 2).
 */
class DownloadService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var worker: Job? = null

    private val repo: DownloadRepository
        get() = (application as IptvApp).container.downloadRepository
    private val http: OkHttpClient
        get() = (application as IptvApp).container.httpClient

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notif = buildNotification("Descargas", "Preparando…", 0)
        // Android 10+ exige declarar el tipo de servicio al pasar a primer plano.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notif)
        }
        if (worker?.isActive != true) worker = scope.launch { drainQueue() }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        repo.setActive(null)
        super.onDestroy()
    }

    /** Procesa la cola hasta vaciarla; después el servicio se apaga solo. */
    private suspend fun drainQueue() {
        while (scope.isActive) {
            val next = repo.nextQueued() ?: break
            repo.markRunning(next.id)
            repo.setActive(next.id)
            val result = runCatching { downloadOne(next) }
            repo.setActive(null)
            result.onFailure { e ->
                // Pausar o cancelar no son errores: los pidió el usuario.
                // (status null = el registro ya no existe, lo borraron.)
                val st = repo.statusOf(next.id)
                if (st != null && st != DownloadStatus.PAUSED) {
                    repo.markFailed(next.id, e.message ?: "Error de descarga")
                    notify("Falló la descarga", next.title, null)
                }
            }
        }
        stopSelf()
    }

    private suspend fun downloadOne(item: DownloadEntity) = withContext(Dispatchers.IO) {
        val file = File(item.localPath)
        file.parentFile?.mkdirs()
        var already = if (file.exists()) file.length() else 0L

        val req = Request.Builder()
            .url(item.sourceUrl)
            .apply { if (already > 0) header("Range", "bytes=$already-") }
            .build()

        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) error("El servidor respondió ${resp.code}")
            // 200 = no soporta reanudar: arrancamos de cero.
            if (resp.code == 200 && already > 0) {
                file.delete()
                already = 0L
            }
            val body = resp.body ?: error("Respuesta vacía del servidor")
            val remaining = body.contentLength().takeIf { it > 0 } ?: 0L
            val total = if (remaining > 0) already + remaining else item.bytesTotal
            repo.saveProgress(item.id, already, total)

            RandomAccessFile(file, "rw").use { out ->
                out.seek(already)
                val buf = ByteArray(256 * 1024)
                var downloaded = already
                var lastSaved = System.currentTimeMillis()
                var lastNotified = 0L
                body.byteStream().use { input ->
                    while (true) {
                        if (!scope.isActive) error("Descarga interrumpida")
                        val n = input.read(buf)
                        if (n <= 0) break
                        out.write(buf, 0, n)
                        downloaded += n

                        val now = System.currentTimeMillis()
                        // Guardar/notificar con moderación: escribir en cada chunk
                        // castiga la base y la barra de notificaciones.
                        if (now - lastSaved > 1000) {
                            lastSaved = now
                            repo.saveProgress(item.id, downloaded, total)
                            // ¿El usuario pausó o borró mientras tanto?
                            val st = repo.statusOf(item.id)
                            if (st == DownloadStatus.PAUSED) error("Pausada")
                            if (st == null) error("Cancelada")
                        }
                        if (now - lastNotified > 1500) {
                            lastNotified = now
                            val pct = if (total > 0) ((downloaded * 100) / total).toInt() else null
                            notify(
                                item.title,
                                if (total > 0) "${formatBytes(downloaded)} de ${formatBytes(total)}"
                                else formatBytes(downloaded),
                                pct,
                            )
                        }
                    }
                }
                repo.saveProgress(item.id, downloaded, if (total > 0) total else downloaded)
            }
        }
        repo.markDone(item.id)
        notify("Descarga lista", item.title, null)
    }

    // ===== Notificación =====
    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(NotificationManager::class.java)
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        mgr.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Descargas", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Progreso de las descargas de películas y series"
                setShowBadge(false)
            }
        )
    }

    private fun buildNotification(title: String, text: String, percent: Int?) =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(percent != null)
            .setOnlyAlertOnce(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    this, 0, Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
            )
            .apply { if (percent != null) setProgress(100, percent, false) }
            .build()

    private fun notify(title: String, text: String, percent: Int?) {
        runCatching {
            getSystemService(NotificationManager::class.java)
                .notify(NOTIF_ID, buildNotification(title, text, percent))
        }
    }

    companion object {
        private const val CHANNEL_ID = "downloads"
        private const val NOTIF_ID = 4711

        /** Despierta el servicio para que procese la cola. */
        fun start(context: Context) {
            val intent = Intent(context, DownloadService::class.java)
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
