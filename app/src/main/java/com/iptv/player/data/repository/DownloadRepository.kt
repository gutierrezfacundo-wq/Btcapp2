package com.iptv.player.data.repository

import android.content.Context
import android.os.Environment
import android.os.StatFs
import com.iptv.player.data.local.DownloadDao
import com.iptv.player.data.local.DownloadEntity
import com.iptv.player.data.local.DownloadStatus
import com.iptv.player.data.model.MediaKind
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/**
 * Descargas locales: qué se bajó, qué falta y dónde quedó cada archivo.
 * El trabajo pesado lo hace DownloadService (uno por vez); acá vive el estado.
 */
class DownloadRepository(
    private val appContext: Context,
    private val dao: DownloadDao,
) {

    val downloads: Flow<List<DownloadEntity>> = dao.observeAll()

    /** Id de lo que se está bajando ahora (para la UI); null si no hay nada. */
    private val _activeId = MutableStateFlow<String?>(null)
    val activeId = _activeId.asStateFlow()

    internal fun setActive(id: String?) { _activeId.value = id }

    /** Carpeta de descargas: propia de la app, sin permisos y se limpia al desinstalar. */
    fun downloadsDir(): File {
        val dir = appContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
            ?: File(appContext.filesDir, "movies")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun fileFor(id: String, sourceUrl: String): File {
        val ext = sourceUrl.substringBefore('?').substringAfterLast('.', "")
            .takeIf { it.length in 2..4 && it.all(Char::isLetterOrDigit) } ?: "mp4"
        val safe = id.replace(Regex("[^A-Za-z0-9_-]"), "_")
        return File(downloadsDir(), "$safe.$ext")
    }

    /** Espacio libre en la carpeta de descargas (bytes). */
    fun freeSpaceBytes(): Long = runCatching {
        val st = StatFs(downloadsDir().absolutePath)
        st.availableBlocksLong * st.blockSizeLong
    }.getOrDefault(0L)

    /** Total ocupado por las descargas de la app (bytes). */
    fun usedSpaceBytes(): Long = runCatching {
        downloadsDir().listFiles()?.sumOf { it.length() } ?: 0L
    }.getOrDefault(0L)

    suspend fun get(id: String): DownloadEntity? = dao.get(id)

    /** Ruta local lista para reproducir, o null si no está descargado del todo. */
    suspend fun localPathIfComplete(id: String): String? {
        val d = dao.get(id) ?: return null
        if (!d.isComplete) return null
        return d.localPath.takeIf { File(it).exists() }
    }

    /** Encola un contenido. Si ya existe (completo o en curso), no hace nada. */
    suspend fun enqueue(
        id: String,
        title: String,
        subtitle: String?,
        sourceUrl: String,
        posterUrl: String?,
        kind: MediaKind,
    ): DownloadEntity {
        dao.get(id)?.let { existing ->
            // Reintentar algo fallido o pausado vuelve a encolarlo.
            if (existing.status == DownloadStatus.FAILED || existing.status == DownloadStatus.PAUSED) {
                dao.updateStatus(id, DownloadStatus.QUEUED, null)
                return existing.copy(status = DownloadStatus.QUEUED, error = null)
            }
            return existing
        }
        val entity = DownloadEntity(
            id = id,
            title = title,
            subtitle = subtitle,
            sourceUrl = sourceUrl,
            localPath = fileFor(id, sourceUrl).absolutePath,
            posterUrl = posterUrl,
            kindOrdinal = kind.ordinal,
            bytesDownloaded = 0L,
            bytesTotal = 0L,
            status = DownloadStatus.QUEUED,
            error = null,
            createdAt = System.currentTimeMillis(),
        )
        dao.upsert(entity)
        return entity
    }

    suspend fun pause(id: String) = dao.updateStatus(id, DownloadStatus.PAUSED)
    suspend fun resume(id: String) = dao.updateStatus(id, DownloadStatus.QUEUED, null)

    /** Borra el registro y el archivo (parcial o completo). */
    suspend fun remove(id: String) {
        val d = dao.get(id)
        dao.remove(id)
        d?.let { runCatching { File(it.localPath).delete() } }
    }

    // --- Usado por el servicio ---
    internal suspend fun nextQueued(): DownloadEntity? = dao.nextQueued()
    internal suspend fun markRunning(id: String) = dao.updateStatus(id, DownloadStatus.RUNNING, null)
    internal suspend fun markDone(id: String) = dao.updateStatus(id, DownloadStatus.DONE, null)
    internal suspend fun markFailed(id: String, error: String) =
        dao.updateStatus(id, DownloadStatus.FAILED, error)
    internal suspend fun statusOf(id: String): String? = dao.get(id)?.status
    internal suspend fun saveProgress(id: String, downloaded: Long, total: Long) =
        dao.updateProgress(id, downloaded, total)
    /** Al arrancar: lo que quedó "corriendo" de una sesión anterior vuelve a la cola. */
    internal suspend fun requeueRunning() = dao.requeueRunning()
}

/** "1,4 GB" / "350 MB" para la UI. */
fun formatBytes(bytes: Long): String = when {
    bytes >= 1_000_000_000 -> String.format("%.1f GB", bytes / 1_000_000_000.0)
    bytes >= 1_000_000 -> "${bytes / 1_000_000} MB"
    bytes >= 1_000 -> "${bytes / 1_000} kB"
    else -> "$bytes B"
}
