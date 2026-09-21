package com.iptv.player.download

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import java.io.File

/** MIME por extensión: ayuda a que VLC/MX Player abran el archivo derecho. */
internal fun mimeOf(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
    "mkv" -> "video/x-matroska"
    "avi" -> "video/x-msvideo"
    "mov" -> "video/quicktime"
    "ts" -> "video/mp2t"
    "webm" -> "video/webm"
    else -> "video/mp4"
}

/**
 * Le da permiso de lectura a todas las apps que puedan atender el intent.
 * FLAG_GRANT_READ_URI_PERMISSION alcanza en la mayoría de los equipos, pero
 * con el selector "Abrir con" hay ROMs donde el permiso no llega y el
 * reproductor abre en negro o avisa que no puede leer el archivo.
 */
private fun grantToResolvers(context: Context, intent: Intent, uri: Uri) {
    runCatching {
        context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            .forEach { info ->
                context.grantUriPermission(
                    info.activityInfo.packageName,
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
    }
}

/**
 * Abre una descarga con otro reproductor instalado (VLC, MX Player…).
 * Se comparte por content:// con permiso de lectura temporal: pasar un
 * file:// a otra app está prohibido desde Android 7.
 */
fun openWithExternalPlayer(context: Context, localPath: String, title: String) {
    val file = File(localPath)
    if (!file.exists()) {
        Toast.makeText(
            context,
            "No se encuentra el archivo. Si está en la tarjeta SD, revisá que esté puesta.",
            Toast.LENGTH_LONG,
        ).show()
        return
    }
    // Generar el content:// y abrir la app se tratan por separado a propósito:
    // antes cualquier fallo decía "no hay otro reproductor instalado", que es
    // engañoso cuando lo que falló fue compartir el archivo.
    val uri = runCatching { DownloadFileProvider.uriFor(context, file, title) }.getOrElse { e ->
        Toast.makeText(
            context,
            "No se pudo compartir el archivo con otra app (${e.message ?: "error desconocido"})",
            Toast.LENGTH_LONG,
        ).show()
        return
    }
    // Probamos el content:// nosotros mismos antes de pasárselo a otra app: si
    // acá no se puede leer, ningún reproductor va a poder, y así el mensaje
    // dice el motivo real en vez de dejar al otro reproductor fallando solo.
    val check = runCatching {
        context.contentResolver.openInputStream(uri)?.use { it.read() } ?: -1
    }
    if (check.isFailure || check.getOrDefault(-1) < 0) {
        val reason = check.exceptionOrNull()?.message ?: "no se pudo leer el archivo"
        Toast.makeText(context, "No se puede abrir el archivo ($reason)", Toast.LENGTH_LONG).show()
        return
    }
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeOf(localPath))
        // Algunos reproductores leen el URI del ClipData en vez del data.
        clipData = ClipData.newRawUri(title, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra("title", title)
    }
    grantToResolvers(context, intent, uri)
    runCatching {
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
    val uri = runCatching { DownloadFileProvider.uriFor(context, file, title) }.getOrElse { e ->
        Toast.makeText(
            context,
            "No se pudo compartir el archivo (${e.message ?: "error desconocido"})",
            Toast.LENGTH_LONG,
        ).show()
        return
    }
    runCatching {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeOf(localPath)
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TITLE, title)
            clipData = ClipData.newRawUri(title, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        grantToResolvers(context, intent, uri)
        context.startActivity(Intent.createChooser(intent, "Compartir").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }
}
