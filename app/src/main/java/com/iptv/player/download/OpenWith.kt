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
 * Tipo real del archivo, mirando sus primeros bytes.
 *
 * La extensión se deduce de la URL del proveedor y miente seguido: muchos
 * paneles sirven un MKV o un MPEG-TS con nombre .mp4. El reproductor de la app
 * no se entera porque husmea el contenido, pero a otro reproductor le estábamos
 * declarando un tipo falso, y algunos filtran por eso.
 */
internal fun mimeOfFile(file: File): String {
    val head = runCatching {
        ByteArray(16).also { buf -> file.inputStream().use { it.read(buf) } }
    }.getOrNull() ?: return mimeOf(file.name)

    fun ascii(from: Int, text: String) =
        text.indices.all { i -> head.getOrNull(from + i)?.toInt()?.toChar() == text[i] }

    return when {
        head[0] == 0x1A.toByte() && head[1] == 0x45.toByte() &&
            head[2] == 0xDF.toByte() && head[3] == 0xA3.toByte() -> "video/x-matroska"
        ascii(4, "ftyp") -> "video/mp4"
        ascii(0, "RIFF") && ascii(8, "AVI ") -> "video/x-msvideo"
        ascii(0, "FLV") -> "video/x-flv"
        head[0] == 0x47.toByte() -> "video/mp2t"
        else -> mimeOf(file.name)
    }
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
        setDataAndType(uri, mimeOfFile(file))
        putExtra("title", title)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val plain = Intent(Intent.ACTION_VIEW, uri).apply {
        putExtra("title", title)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val typed = resolvesToSomething(context, withType)
    val intent = if (typed || !resolvesToSomething(context, plain)) withType else plain
    // El aviso va acá y no en el catch de startActivity: el selector del sistema
    // siempre abre, así que si no hay con qué abrir el archivo eso nunca falla y
    // el usuario se queda mirando una hoja vacía sin saber por qué.
    if (!typed && !resolvesToSomething(context, plain)) {
        toast(context, "No se ve ningún reproductor de video instalado. Con VLC anda seguro.")
    }
    runCatching {
        context.startActivity(Intent.createChooser(intent, "Abrir con").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }.onFailure { e ->
        LocalMediaServer.clear()
        toast(context, "No se pudo abrir el selector (${e.message ?: "error desconocido"})")
    }
}

/**
 * Camino alternativo: compartir el archivo por content:// con permiso temporal.
 * Queda como respaldo del servidor local y es lo que se usa para "Compartir".
 */
private fun openWithContentUri(context: Context, file: File, title: String, reason: String?) {
    // Que el camino nuevo falle en silencio y caiga al viejo deja el síntoma
    // idéntico al de antes y no hay forma de saber cuál se usó: se avisa.
    reason?.let { toast(context, "No se pudo usar el servidor local ($it); probando el modo anterior") }
    val uri = runCatching { DownloadFileProvider.uriFor(context, file, title) }.getOrElse { e ->
        toast(context, "No se pudo abrir el archivo (${reason ?: e.message ?: "error desconocido"})")
        return
    }
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeOfFile(file))
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
