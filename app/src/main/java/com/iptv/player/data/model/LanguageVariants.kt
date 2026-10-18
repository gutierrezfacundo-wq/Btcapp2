package com.iptv.player.data.model

/**
 * Los proveedores suelen publicar la misma película varias veces, una por
 * idioma: "Duna (LAT)", "Duna [SUB]", "Duna - CASTELLANO". Como el archivo se
 * descarga entero (no se puede pedir una sola pista de audio), elegir idioma
 * al descargar es elegir CUÁL de esas versiones bajar.
 *
 * OJO con el costo: esto se consulta sobre catálogos de decenas de miles de
 * títulos. Todos los Regex son constantes (compilarlos por llamada era carísimo)
 * y la búsqueda pre-filtra con comparaciones baratas antes de tocar un Regex.
 */
object LanguageVariants {

    /** Etiquetas de idioma conocidas → nombre lindo para la UI. */
    private val TAGS: List<Pair<Regex, String>> = listOf(
        Regex("\\b(lat|latino|latin|esp[ -]?lat)\\b", RegexOption.IGNORE_CASE) to "Latino",
        Regex("\\b(cast|castellano|espa[nñ]a)\\b", RegexOption.IGNORE_CASE) to "Castellano",
        Regex("\\b(sub|subtitulad[ao]|vose|subs)\\b", RegexOption.IGNORE_CASE) to "Subtitulada",
        Regex("\\b(dual|dual[ -]?audio)\\b", RegexOption.IGNORE_CASE) to "Dual",
        Regex("\\b(eng|ingl[eé]s|english|vo)\\b", RegexOption.IGNORE_CASE) to "Inglés",
        Regex("\\b(esp|espa[nñ]ol)\\b", RegexOption.IGNORE_CASE) to "Español",
        Regex("\\b(por|portugu[eê]s|bra)\\b", RegexOption.IGNORE_CASE) to "Portugués",
    )

    // Constantes: antes se creaban dentro de baseName() y se recompilaban en
    // cada título del catálogo.
    private val BRACKETS = Regex("[\\[(][^\\])]*[\\])]")
    private val QUALITY = Regex("\\b(4k|uhd|fhd|hd|sd|1080p?|720p?|2160p?)\\b", RegexOption.IGNORE_CASE)
    private val SEPARATORS = Regex("[-_.·|]+")
    private val SPACES = Regex("\\s+")

    /** Etiqueta de idioma de un título, o null si no declara ninguna. */
    fun labelOf(name: String): String? =
        TAGS.firstOrNull { (re, _) -> re.containsMatchIn(name) }?.second

    /**
     * Nombre sin etiquetas de idioma, calidad ni separadores, para agrupar
     * las versiones de una misma película.
     */
    fun baseName(name: String): String {
        var s = BRACKETS.replace(name, " ")
        TAGS.forEach { (re, _) -> s = re.replace(s, " ") }
        s = QUALITY.replace(s, " ")
        s = SEPARATORS.replace(s, " ")
        return SPACES.replace(s, " ").trim().lowercase()
    }

    /**
     * Clave barata para pre-filtrar candidatos SIN usar Regex: las primeras
     * letras/dígitos del título en minúscula. Dos versiones del mismo título
     * siempre comparten esta clave, así que alcanza para descartar al resto
     * del catálogo antes de hacer el trabajo caro.
     */
    fun quickKey(name: String): String {
        val sb = StringBuilder(PREFIX_LEN)
        for (c in name) {
            if (c.isLetterOrDigit()) {
                sb.append(c.lowercaseChar())
                if (sb.length == PREFIX_LEN) break
            }
        }
        return sb.toString()
    }

    private const val PREFIX_LEN = 8

    /**
     * Versiones del mismo título presentes en el catálogo (incluida la
     * original). Lista vacía si no hay alternativas reales.
     *
     * Conviene llamarla fuera del hilo principal: recorre el catálogo entero
     * una vez (con comparaciones baratas).
     */
    fun variantsOf(movie: Movie, catalog: List<Movie>): List<Movie> {
        val base = baseName(movie.name)
        if (base.length < 3) return emptyList()
        val key = quickKey(movie.name)
        if (key.isEmpty()) return emptyList()

        // 1) Pre-filtro barato: solo los títulos que empiezan igual.
        val candidates = catalog.filter { quickKey(it.name) == key }
        if (candidates.size < 2) return emptyList()

        // 2) Ahora sí el trabajo caro, sobre un puñado de candidatos.
        val same = candidates.filter { baseName(it.name) == base }
        if (same.size < 2) return emptyList()
        val distinct = same.distinctBy { labelOf(it.name) ?: it.name }
        return if (distinct.size < 2) emptyList() else same.sortedBy { it.name }
    }
}
