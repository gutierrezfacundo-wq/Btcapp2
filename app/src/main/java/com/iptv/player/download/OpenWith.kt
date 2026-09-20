package com.iptv.player.download

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

/** MIME por extensión: ayuda a que VLC/MX Player abran el archivo derecho. */
private fun mimeOf(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
    "mkv" -> "video/x-matroska"
    "avi" -> "video/x-msvideo"
    "mov" -> "video/quicktime"
    "ts" -> "video/mp2t"
    "webm" -> "video/webm"
    else -> "video/mp4"
}

private fun uriFor(context: Context, file: File) =
    FileProvider.getUriForFile(context, "${context.packageName}.files", file)

/**
 * Abre una descarga con otro reproductor instalado (VLC, MX Player…).
 * Se comparte por content:// con permiso de lectura temporal: pasar un
 * file:// a otra app está prohibido desde Android 7.
 */
fun openWithExternalPlayer(context: Context, localPath: String, title: String) {
    val file = File(localPath)
    if (!file.exists()) {
        Toast.makeText(context, "No se encuentra el archivo descargado", Toast.LENGTH_SHORT).show()
        return
    }
    runCatching {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uriFor(context, file), mimeOf(localPath))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra("title", title)
        }
        context.startActivity(Intent.createChooser(intent, "Abrir con").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }.onFailure {
        Toast.makeText(context, "No hay otro reproductor instalado", Toast.LENGTH_SHORT).show()
    }
}

/** Comparte el archivo descargado (mandarlo a otra app, copiarlo, etc.). */
fun shareDownload(context: Context, localPath: String, title: String) {
    val file = File(localPath)
    if (!file.exists()) return
    runCatching {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeOf(localPath)
            putExtra(Intent.EXTRA_STREAM, uriFor(context, file))
            putExtra(Intent.EXTRA_TITLE, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "Compartir").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }
}
