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

private fun toast(context: Context, text: String, long: Boolean = true) =
    Toast.makeText(context, text, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()

/** ¿Alguna app instalada puede atender esto? Con <queries> declarado da una respuesta útil. */
private fun resolvesToSomething(context: Context, intent: Intent): Boolean = runCatching {
    context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY).isNotEmpty()
}.getOrDefault(false)

/**
 * Abre una descarga con otro reproductor instalado (VLC, MX Player…).
 *
 * Se la servimos por HTTP en 127.0.0.1 en vez de pasarle un content://.
 * Compartir un archivo por content:// depende de que la otra app maneje bien
 * ese tipo de URI y de que el permiso temporal le llegue; con las descargas
 * guardadas en la tarjeta SD eso no venía funcionando (VLC recibía el URI y no
 * llegaba a abrirlo). Una URL http:// la abre cualquier reproductor —es lo
 * mismo que abrir un stream de red— y esquiva el permiso de URI y el
 * almacenamiento con alcance. El servidor solo escucha en loopback.
 */
fun openWithExternalPlayer(context: Context, localPath: String, title: String) {
    val file = File(localPath)
    if (!file.exists()) {
        toast(context, "No se encuentra el archivo. Si está en la tarjeta SD, revisá que esté puesta.")
        return
    }
    val url = runCatching { LocalMediaServer.urlFor(file, title) }.getOrElse { e ->
        // Si no se pudo levantar el servidor local, probamos el camino viejo.
        openWithContentUri(context, file, title, reason = e.message)
        return
    }
    // La app tiene que seguir viva mientras el otro reproductor lee el archivo.
    SharingService.start(context, title)

    val uri = Uri.parse(url)
    // Algunos reproductores filtran por MIME y otros solo por la extensión de la
    // URL: se prueba con tipo y, si nadie lo atiende, sin tipo.
    val withType = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeOf(localPath))
        putExtra("title", title)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val plain = Intent(Intent.ACTION_VIEW, uri).apply {
        putExtra("title", title)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val intent = if (resolvesToSomething(context, withType) || !resolvesToSomething(context, plain)) {
        withType
    } else {
        plain
    }
    runCatching {
        context.startActivity(Intent.createChooser(intent, "Abrir con").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }.onFailure {
        LocalMediaServer.clear()
        toast(context, "No hay otro reproductor instalado", long = false)
    }
}

/**
 * Camino alternativo: compartir el archivo por content:// con permiso temporal.
 * Queda como respaldo del servidor local y es lo que se usa para "Compartir".
 */
private fun openWithContentUri(context: Context, file: File, title: String, reason: String?) {
    val uri = runCatching { DownloadFileProvider.uriFor(context, file, title) }.getOrElse { e ->
        toast(context, "No se pudo abrir el archivo (${reason ?: e.message ?: "error desconocido"})")
        return
    }
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeOf(file.name))
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
        toast(context, "No hay otro reproductor instalado", long = false)
    }
}

/**
 * Le da permiso de lectura a todas las apps que puedan atender el intent.
 * FLAG_GRANT_READ_URI_PERMISSION alcanza en la mayoría de los equipos, pero con
 * el selector "Abrir con" hay ROMs donde el permiso no llega.
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

/** Comparte el archivo descargado (mandarlo a otra app, copiarlo, etc.). */
fun shareDownload(context: Context, localPath: String, title: String) {
    val file = File(localPath)
    if (!file.exists()) return
    val uri = runCatching { DownloadFileProvider.uriFor(context, file, title) }.getOrElse { e ->
        toast(context, "No se pudo compartir el archivo (${e.message ?: "error desconocido"})")
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
