package com.iptv.player.download

import android.content.ContentProvider
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

/**
 * Comparte las descargas con otras apps (VLC, MX Player…) por content://.
 *
 * No usamos FileProvider a propósito: FileProvider resuelve la ruta con
 * getCanonicalPath, y en una tarjeta SD la carpeta que ve la app
 * (/storage/XXXX-XXXX/Android/data/…) suele ser un montaje que apunta a otra
 * ruta real (/mnt/media_rw/…) a la que ni siquiera nuestro propio proceso tiene
 * acceso. El URI se generaba bien pero al abrirlo daba permiso denegado, así
 * que el reproductor externo fallaba solo con lo guardado en la tarjeta,
 * mientras el de la app —que abre la ruta tal cual— andaba.
 *
 * Acá abrimos exactamente la ruta que usa la app, sin canonicalizar.
 * Solo se sirven archivos que estén dentro de las carpetas de descargas.
 */
class DownloadFileProvider : ContentProvider() {

    companion object {
        fun authority(context: Context) = "${context.packageName}.downloads"

        /** Carpetas que el provider acepta servir (memoria del equipo, SD…). */
        private fun roots(context: Context): List<File> = buildList {
            runCatching { context.getExternalFilesDirs(Environment.DIRECTORY_MOVIES) }
                .getOrNull()?.filterNotNull()?.forEach { add(it) }
            add(File(context.filesDir, "movies"))
        }

        /**
         * URI para compartir [file]. [displayName] es lo que ve la otra app
         * (el título, en vez del nombre interno del archivo).
         */
        fun uriFor(context: Context, file: File, displayName: String? = null): Uri {
            val roots = roots(context)
            val path = file.absolutePath
            val index = roots.indexOfFirst { path.startsWith(it.absolutePath + File.separator) }
            require(index >= 0) { "el archivo está fuera de las carpetas de descargas" }
            val relative = path.removePrefix(roots[index].absolutePath + File.separator)
            val builder = Uri.Builder()
                .scheme(ContentResolver.SCHEME_CONTENT)
                .authority(authority(context))
                .appendPath("v$index")
            relative.split(File.separatorChar).forEach { builder.appendPath(it) }
            displayName?.let { builder.appendQueryParameter("name", it) }
            return builder.build()
        }
    }

    private fun fileFor(uri: Uri): File? {
        val ctx = context ?: return null
        val segments = uri.pathSegments
        if (segments.size < 2) return null
        val index = segments[0].removePrefix("v").toIntOrNull() ?: return null
        val root = roots(ctx).getOrNull(index) ?: return null
        val rest = segments.drop(1)
        if (rest.any { it.isEmpty() || it == "." || it == ".." }) return null
        val file = File(root, rest.joinToString(File.separator))
        // Cinturón y tiradores: la ruta armada tiene que seguir adentro de la carpeta.
        if (!file.absolutePath.startsWith(root.absolutePath + File.separator)) return null
        return file
    }

    /** Nombre lindo para la otra app, conservando la extensión real. */
    private fun displayNameFor(uri: Uri, file: File): String {
        val wanted = runCatching { uri.getQueryParameter("name") }.getOrNull()
            ?.replace(Regex("[\\\\/:*?\"<>|]"), " ")
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: return file.name
        val ext = file.name.substringAfterLast('.', "")
        return if (ext.isEmpty()) wanted else "$wanted.$ext"
    }

    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String = mimeOf(uri.path.orEmpty())

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw FileNotFoundException("Solo lectura: $uri")
        val file = fileFor(uri) ?: throw FileNotFoundException("URI inválido: $uri")
        if (!file.exists()) throw FileNotFoundException("No existe el archivo: ${file.name}")
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    /**
     * Muchos reproductores piden nombre y tamaño antes de abrir; si no los
     * contestamos, algunos ni intentan reproducir.
     */
    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        val file = fileFor(uri)?.takeIf { it.exists() } ?: return null
        val columns = projection?.toList()
            ?: listOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        // _data se omite a propósito: es una ruta privada de la app y si la
        // contestamos hay reproductores que intentan abrirla directo y fallan.
        val values = columns.map { column ->
            when (column) {
                OpenableColumns.DISPLAY_NAME -> displayNameFor(uri, file)
                OpenableColumns.SIZE -> file.length()
                else -> null
            }
        }
        return MatrixCursor(columns.toTypedArray(), 1).apply { addRow(values) }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? =
        throw UnsupportedOperationException()

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = throw UnsupportedOperationException()

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException()
}
