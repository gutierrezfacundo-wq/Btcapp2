package com.iptv.player.data.model

/**
 * Los proveedores suelen publicar la misma película varias veces, una por
 * idioma: "Duna (LAT)", "Duna [SUB]", "Duna - CASTELLANO". Como el archivo se
 * descarga entero (no se puede pedir una sola pista de audio), elegir idioma
 * al descargar es elegir CUÁL de esas versiones bajar.
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

    /** Etiqueta de idioma de un título, o null si no declara ninguna. */
    fun labelOf(name: String): String? =
        TAGS.firstOrNull { (re, _) -> re.containsMatchIn(name) }?.second

    /**
     * Nombre sin etiquetas de idioma, calidad ni separadores, para agrupar
     * las versiones de una misma película.
     */
    fun baseName(name: String): String {
        var s = name
        // Paréntesis/corchetes con idioma o calidad: "(LAT)", "[1080p]"
        s = s.replace(Regex("[\\[(][^\\])]*[\\])]"), " ")
        TAGS.forEach { (re, _) -> s = re.replace(s, " ") }
        s = s.replace(Regex("\\b(4k|uhd|fhd|hd|sd|1080p?|720p?|2160p?)\\b", RegexOption.IGNORE_CASE), " ")
        s = s.replace(Regex("[-_.·|]+"), " ")
        return s.replace(Regex("\\s+"), " ").trim().lowercase()
    }

    /**
     * Versiones del mismo título presentes en el catálogo (incluida la
     * original). Devuelve lista vacía si no hay alternativas reales.
     */
    fun variantsOf(movie: Movie, catalog: List<Movie>): List<Movie> {
        val base = baseName(movie.name)
        if (base.length < 3) return emptyList()
        val same = catalog.filter { baseName(it.name) == base }
        // Solo tiene sentido elegir si hay más de una y se distinguen entre sí.
        if (same.size < 2) return emptyList()
        val distinct = same.distinctBy { labelOf(it.name) ?: it.name }
        return if (distinct.size < 2) emptyList() else same.sortedBy { it.name }
    }
}
