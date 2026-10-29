package com.iptv.player.download

import java.io.BufferedInputStream
import java.io.File
import java.io.IOException
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Servidor HTTP mínimo, atado a 127.0.0.1, para pasarle una descarga a otro
 * reproductor como una URL en vez de un content://.
 *
 * Por qué existe: compartir un archivo por content:// depende de que la otra
 * app sepa manejarlo y de que el permiso temporal le llegue bien; con archivos
 * en la tarjeta SD eso viene fallando. Una URL http:// la abre cualquier
 * reproductor (es lo mismo que abrir un stream de red, que es justamente para
 * lo que están hechos) y esquiva por completo el permiso de URI y el
 * almacenamiento con alcance.
 *
 * Solo escucha en loopback: no sale del equipo. La ruta lleva un token al azar
 * para que otra app del equipo no pueda adivinar qué se está sirviendo, y solo
 * se sirven archivos que la app registró explícitamente.
 */
object LocalMediaServer {

    private val files = ConcurrentHashMap<String, File>()
    private val workers = Executors.newCachedThreadPool { r ->
        Thread(r, "local-media-server").apply { isDaemon = true }
    }

    @Volatile
    private var server: ServerSocket? = null

    /** Momento del último pedido: lo usa el servicio para saber si sigue en uso. */
    @Volatile
    var lastRequestAt: Long = 0L
        private set

    /** ¿Hay algo publicado ahora mismo? */
    val isPublishing: Boolean get() = files.isNotEmpty()

    /** Conexiones abiertas. Un reproductor en pausa la deja abierta sin pedir nada. */
    private val open = java.util.concurrent.atomic.AtomicInteger(0)
    val activeConnections: Int get() = open.get()

    /**
     * Deja [file] disponible y devuelve la URL para pasarle a otro reproductor.
     * El nombre visible se usa solo para que el reproductor muestre algo lindo.
     */
    @Synchronized
    fun urlFor(file: File, displayName: String?): String {
        val socket = ensureStarted()
        val token = UUID.randomUUID().toString().replace("-", "")
        files[token] = file
        // Arranca el reloj de inactividad acá: el reproductor tarda un momento
        // en conectarse y no queremos cortar antes de que lo haga.
        lastRequestAt = System.currentTimeMillis()
        val ext = file.name.substringAfterLast('.', "")
        val base = (displayName?.takeIf { it.isNotBlank() } ?: file.nameWithoutExtension)
            .replace(Regex("[^\\p{L}\\p{N} ._-]"), " ")
            .trim()
            .ifEmpty { "video" }
        val name = if (ext.isEmpty()) base else "$base.$ext"
        val encoded = URLEncoder.encode(name, "UTF-8").replace("+", "%20")
        return "http://127.0.0.1:${socket.localPort}/$token/$encoded"
    }

    /** Suelta lo publicado. El servidor queda escuchando: no cuesta nada. */
    fun clear() = files.clear()

    private fun ensureStarted(): ServerSocket {
        server?.takeIf { !it.isClosed }?.let { return it }
        // Puerto 0 = el sistema elige uno libre. Backlog chico: un reproductor
        // abre pocas conexiones (una por lectura, otra al buscar en la película).
        val socket = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
        server = socket
        workers.execute { acceptLoop(socket) }
        return socket
    }

    private fun acceptLoop(socket: ServerSocket) {
        while (!socket.isClosed) {
            val client = try {
                socket.accept()
            } catch (e: IOException) {
                return
            }
            workers.execute {
                open.incrementAndGet()
                try {
                    serve(client)
                } catch (e: Throwable) {
                    // Que el reproductor corte la conexión es lo normal.
                } finally {
                    open.decrementAndGet()
                }
            }
        }
    }

    private fun serve(client: Socket) {
        client.use { sock ->
            sock.soTimeout = 30_000
            val input = BufferedInputStream(sock.getInputStream())
            val requestLine = readLine(input) ?: return
            var range: String? = null
            while (true) {
                val header = readLine(input) ?: break
                if (header.isEmpty()) break
                if (header.startsWith("Range:", ignoreCase = true)) {
                    range = header.substringAfter(':').trim()
                }
            }
            val parts = requestLine.split(' ')
            if (parts.size < 2) return
            val method = parts[0].uppercase()
            if (method != "GET" && method != "HEAD") {
                respondError(sock.getOutputStream(), 405, "Method Not Allowed")
                return
            }
            val token = parts[1].removePrefix("/").substringBefore('/')
            lastRequestAt = System.currentTimeMillis()
            val file = files[token]
            if (file == null || !file.exists()) {
                respondError(sock.getOutputStream(), 404, "Not Found")
                return
            }
            respondFile(sock.getOutputStream(), file, range, headOnly = method == "HEAD")
        }
    }

    /** Lee una línea terminada en CRLF sin comerse el cuerpo. */
    private fun readLine(input: BufferedInputStream): String? {
        val out = StringBuilder()
        while (true) {
            val b = input.read()
            if (b < 0) return if (out.isEmpty()) null else out.toString()
            if (b == '\n'.code) return out.toString().removeSuffix("\r")
            out.append(Char(b))
            if (out.length > 8192) return out.toString()
        }
    }

    private fun respondError(out: OutputStream, code: Int, text: String) {
        runCatching {
            out.write("HTTP/1.1 $code $text\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            out.flush()
        }
    }

    /**
     * Responde el archivo, entero o el pedazo que pidan. El soporte de Range es
     * lo que le permite al reproductor adelantar sin bajar todo de nuevo.
     */
    private fun respondFile(out: OutputStream, file: File, range: String?, headOnly: Boolean) {
        val length = file.length()
        var start = 0L
        var end = length - 1
        var partial = false
        if (range != null && range.startsWith("bytes=")) {
            val spec = range.removePrefix("bytes=").substringBefore(',')
            val from = spec.substringBefore('-').trim()
            val to = spec.substringAfter('-').trim()
            if (from.isEmpty() && to.isNotEmpty()) {
                // "bytes=-500": los últimos 500 bytes.
                val tail = to.toLongOrNull() ?: 0L
                start = (length - tail).coerceAtLeast(0L)
            } else {
                start = from.toLongOrNull() ?: 0L
                if (to.isNotEmpty()) end = to.toLongOrNull() ?: end
            }
            if (start > end || start >= length) {
                runCatching {
                    out.write(
                        ("HTTP/1.1 416 Range Not Satisfiable\r\n" +
                            "Content-Range: bytes */$length\r\n" +
                            "Content-Length: 0\r\nConnection: close\r\n\r\n").toByteArray()
                    )
                    out.flush()
                }
                return
            }
            end = end.coerceAtMost(length - 1)
            partial = true
        }

        val count = end - start + 1
        val header = StringBuilder()
            .append(if (partial) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
            .append("Content-Type: ").append(mimeOfFile(file)).append("\r\n")
            .append("Accept-Ranges: bytes\r\n")
            .append("Content-Length: ").append(count).append("\r\n")
        if (partial) header.append("Content-Range: bytes $start-$end/$length\r\n")
        header.append("Connection: close\r\n\r\n")

        runCatching {
            out.write(header.toString().toByteArray())
            if (headOnly) {
                out.flush()
                return
            }
            RandomAccessFile(file, "r").use { raf ->
                raf.seek(start)
                val buf = ByteArray(128 * 1024)
                var left = count
                while (left > 0) {
                    val n = raf.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
                    if (n <= 0) break
                    out.write(buf, 0, n)
                    left -= n
                }
            }
            out.flush()
        }
        // Si el reproductor corta la conexión (pasa siempre que el usuario
        // adelanta), la escritura falla: no es un error, se ignora.
    }
}
