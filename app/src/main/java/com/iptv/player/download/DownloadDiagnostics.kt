package com.iptv.player.download

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Junta en un texto todo lo que hace falta para entender por qué otro
 * reproductor no abre una descarga, y lo deja en el portapapeles.
 *
 * Existe porque adivinar desde acá salió caro: sin saber qué ve el equipo del
 * usuario (dónde quedó el archivo, qué tipo es de verdad, si el servidor local
 * responde, qué reproductores hay instalados) cada arreglo es una apuesta.
 */
fun copyDownloadDiagnostics(context: Context, localPath: String, title: String) {
    val app = context.applicationContext
    // Todo esto toca disco y red local: nunca en el hilo principal.
    thread(name = "download-diagnostics") {
        val report = runCatching { buildReport(app, localPath, title) }
            .getOrElse { "No se pudo armar el diagnóstico: ${it.javaClass.simpleName}: ${it.message}" }
        Handler(Looper.getMainLooper()).post {
            runCatching {
                app.getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("Diagnóstico de descarga", report))
            }
            Toast.makeText(app, "Diagnóstico copiado. Pegalo en el chat.", Toast.LENGTH_LONG).show()
        }
    }
}

private fun buildReport(context: Context, localPath: String, title: String): String {
    val out = StringBuilder()
    fun line(label: String, value: Any?) = out.append(label).append(": ").append(value).append('\n')

    line("equipo", "${Build.MANUFACTURER} ${Build.MODEL}")
    line("android", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
    line("titulo", title)

    val file = File(localPath)
    line("ruta", localPath)
    line("existe", file.exists())
    if (!file.exists()) return out.toString()
    line("tamano", file.length())
    line("legible", file.canRead())
    line("volumen", volumeOf(context, file))
    line("tipo por extension", mimeOf(file.name))
    line("tipo por contenido", mimeOfFile(file))

    // --- Camino content:// ---
    val contentUri = runCatching { DownloadFileProvider.uriFor(context, file, title) }
    line("content uri", contentUri.getOrNull() ?: "ERROR ${contentUri.exceptionOrNull()?.message}")
    contentUri.getOrNull()?.let { uri ->
        val read = runCatching {
            context.contentResolver.openInputStream(uri)?.use { it.read() } ?: -1
        }
        line(
            "content lectura propia",
            if (read.isSuccess) "ok (byte ${read.getOrNull()})"
            else "ERROR ${read.exceptionOrNull()?.javaClass?.simpleName}: ${read.exceptionOrNull()?.message}",
        )
    }

    // --- Camino servidor local ---
    val url = runCatching { LocalMediaServer.urlFor(file, title) }
    line("url local", url.getOrNull() ?: "ERROR ${url.exceptionOrNull()?.message}")
    url.getOrNull()?.let { line("url local prueba", probe(it)) }

    // --- Con qué se puede abrir ---
    line("reproductores http", resolversFor(context, Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.parse(url.getOrNull() ?: "http://127.0.0.1/x.mp4"), mimeOfFile(file))
    }))
    contentUri.getOrNull()?.let { uri ->
        line("reproductores content", resolversFor(context, Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mimeOfFile(file))
        }))
    }
    line("vlc instalado", isInstalled(context, "org.videolan.vlc"))
    line(
        "mx player instalado",
        isInstalled(context, "com.mxtech.videoplayer.ad") ||
            isInstalled(context, "com.mxtech.videoplayer.pro"),
    )
    return out.toString()
}

/** En qué volumen cayó el archivo, para saber si está en la tarjeta. */
private fun volumeOf(context: Context, file: File): String {
    val dirs = runCatching {
        context.getExternalFilesDirs(android.os.Environment.DIRECTORY_MOVIES)
    }.getOrNull().orEmpty()
    val path = file.absolutePath
    dirs.forEachIndexed { i, dir ->
        if (dir != null && path.startsWith(dir.absolutePath)) {
            return if (i == 0) "memoria del equipo" else "tarjeta SD (indice $i)"
        }
    }
    return "fuera de las carpetas conocidas"
}

/** Pide el primer byte al servidor local: si esto anda, el reproductor puede leerlo. */
private fun probe(url: String): String = runCatching {
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.setRequestProperty("Range", "bytes=0-0")
    conn.connectTimeout = 5_000
    conn.readTimeout = 5_000
    try {
        val code = conn.responseCode
        val type = conn.getHeaderField("Content-Type")
        val range = conn.getHeaderField("Content-Range")
        val read = conn.inputStream.use { it.read() }
        "HTTP $code, tipo $type, rango $range, byte $read"
    } finally {
        conn.disconnect()
    }
}.getOrElse { "ERROR ${it.javaClass.simpleName}: ${it.message}" }

private fun resolversFor(context: Context, intent: Intent): String = runCatching {
    val apps = context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
    if (apps.isEmpty()) "ninguno visible"
    else apps.joinToString(", ") { it.activityInfo.packageName }
}.getOrElse { "ERROR ${it.message}" }

private fun isInstalled(context: Context, pkg: String): Boolean = runCatching {
    context.packageManager.getPackageInfo(pkg, 0)
    true
}.getOrDefault(false)
