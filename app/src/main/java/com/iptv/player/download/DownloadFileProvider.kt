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

        /** Segmento del volumen interno (filesDir), el plan B sin almacenamiento externo. */
        private const val INTERNAL = "i"

        /**
         * Volúmenes externos (memoria del equipo, SD…). Se conservan los nulos
         * a propósito: getExternalFilesDirs devuelve null en la posición de un
         * volumen que ahora no está, y si los filtráramos se correrían los
         * índices y un URI viejo apuntaría a otro volumen.
         */
        private fun externalRoots(context: Context): List<File?> =
            runCatching { context.getExternalFilesDirs(Environment.DIRECTORY_MOVIES) }
                .getOrNull()?.toList().orEmpty()

        private fun internalRoot(context: Context) = File(context.filesDir, "movies")

        /**
         * URI para compartir [file]. [displayName] es lo que ve la otra app
         * (el título, en vez del nombre interno del archivo).
         */
        fun uriFor(context: Context, file: File, displayName: String? = null): Uri {
            val path = file.absolutePath
            fun under(root: File?) =
                root != null && path.startsWith(root.absolutePath + File.separator)

            val external = externalRoots(context)
            val index = external.indexOfFirst(::under)
            val root = if (index >= 0) external[index]!! else internalRoot(context)
            require(index >= 0 || under(root)) { "el archivo está fuera de las carpetas de descargas" }

            val relative = path.removePrefix(root.absolutePath + File.separator)
            val builder = Uri.Builder()
                .scheme(ContentResolver.SCHEME_CONTENT)
                .authority(authority(context))
                .appendPath(if (index >= 0) "v$index" else INTERNAL)
            relative.split(File.separatorChar).forEach { builder.appendPath(it) }
            displayName?.let { builder.appendQueryParameter("name", it) }
            return builder.build()
        }
    }

    private fun fileFor(uri: Uri): File? {
        val ctx = context ?: return null
        val segments = uri.pathSegments
        if (segments.size < 2) return null
        val root = when (val volume = segments[0]) {
            INTERNAL -> internalRoot(ctx)
            else -> volume.removePrefix("v").toIntOrNull()
                ?.let { externalRoots(ctx).getOrNull(it) }
        } ?: return null
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

    override fun getType(uri: Uri): String =
        fileFor(uri)?.let { mimeOfFile(it) } ?: mimeOf(uri.path.orEmpty())

    /**
     * Siempre se abre en solo lectura, sin mirar el modo pedido: un reproductor
     * nunca escribe, y rechazar el pedido por el modo solo agrega una forma más
     * de fallar (hay apps que piden "rw" por costumbre).
     */
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
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
        val known = listOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        // Se contestan SOLO las columnas que conocemos. Antes se devolvía la
        // proyección entera rellenando con null las demás, y eso es peor que no
        // contestarlas: un reproductor que pide _data la veía presente y vacía,
        // en vez de entender que este provider no la ofrece y usar el
        // descriptor. (_data es además una ruta privada de la app: si la
        // diéramos, la otra app intentaría abrirla directo y fallaría.)
        val columns = projection?.filter { it in known }?.takeIf { it.isNotEmpty() } ?: known
        val values = columns.map { column ->
            when (column) {
                OpenableColumns.DISPLAY_NAME -> displayNameFor(uri, file)
                else -> file.length()
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
