package com.iptv.player.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** Estados de una descarga local. */
object DownloadStatus {
    const val QUEUED = "QUEUED"
    const val RUNNING = "RUNNING"
    const val PAUSED = "PAUSED"
    const val DONE = "DONE"
    const val FAILED = "FAILED"
}

/**
 * Contenido descargado (o en curso) al almacenamiento del teléfono.
 * `id` es el id del contenido (película o episodio), así una misma peli no se
 * encola dos veces.
 */
@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val id: String,
    val title: String,
    /** "T1 · E3", año/género… para mostrar bajo el título. */
    val subtitle: String?,
    val sourceUrl: String,
    val localPath: String,
    val posterUrl: String?,
    /** Miniatura guardada en el teléfono: la lista se ve bien sin internet. */
    val posterPath: String?,
    val kindOrdinal: Int,
    val bytesDownloaded: Long,
    /** 0 si el servidor no informa el tamaño. */
    val bytesTotal: Long,
    val status: String,
    val error: String?,
    val createdAt: Long,
) {
    val isComplete: Boolean get() = status == DownloadStatus.DONE
    /** 0..1, o null si no se conoce el total. */
    val progress: Float?
        get() = if (bytesTotal > 0) (bytesDownloaded.toFloat() / bytesTotal).coerceIn(0f, 1f) else null
}

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :id LIMIT 1")
    suspend fun get(id: String): DownloadEntity?

    /** Siguiente de la cola (FIFO) para el servicio. */
    @Query("SELECT * FROM downloads WHERE status = 'QUEUED' ORDER BY createdAt ASC LIMIT 1")
    suspend fun nextQueued(): DownloadEntity?

    @Query("SELECT * FROM downloads WHERE status IN ('RUNNING','QUEUED')")
    suspend fun active(): List<DownloadEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: DownloadEntity)

    @Query("UPDATE downloads SET bytesDownloaded = :downloaded, bytesTotal = :total WHERE id = :id")
    suspend fun updateProgress(id: String, downloaded: Long, total: Long)

    @Query("UPDATE downloads SET posterPath = :path WHERE id = :id")
    suspend fun updatePosterPath(id: String, path: String)

    @Query("UPDATE downloads SET status = :status, error = :error WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, error: String? = null)

    /** Al arrancar la app: lo que quedó "corriendo" de una sesión muerta vuelve a la cola. */
    @Query("UPDATE downloads SET status = 'QUEUED' WHERE status = 'RUNNING'")
    suspend fun requeueRunning()

    @Query("DELETE FROM downloads WHERE id = :id")
    suspend fun remove(id: String)
}
