package com.iptv.player.ui.components

import com.iptv.player.data.model.Channel

object ChannelAttributes {

    private val COUNTRY_CODES = setOf(
        "AR", "AU", "BR", "CA", "CL", "CO", "CR", "DE", "DO", "EC", "ES", "FR", "GB",
        "GR", "GT", "HN", "IE", "IT", "MX", "NI", "NL", "PA", "PE", "PR", "PT", "PY",
        "SE", "SV", "UK", "US", "USA", "UY", "VE", "RU", "CN", "JP", "KR", "IN", "ID",
        "TR", "BE", "NO", "FI", "DK", "PL", "RO", "AT", "CH", "ZA", "NG", "EG", "AE",
        "SA", "MA", "BO", "CU",
    )

    private val COUNTRY_FULL = mapOf(
        "argentina" to "AR", "brasil" to "BR", "brazil" to "BR", "chile" to "CL",
        "colombia" to "CO", "ecuador" to "EC", "españa" to "ES", "espana" to "ES",
        "spain" to "ES", "francia" to "FR", "france" to "FR", "italia" to "IT",
        "italy" to "IT", "mexico" to "MX", "méxico" to "MX", "peru" to "PE",
        "perú" to "PE", "uruguay" to "UY", "venezuela" to "VE", "paraguay" to "PY",
        "portugal" to "PT", "alemania" to "DE", "germany" to "DE",
        "uk" to "UK", "united kingdom" to "UK", "usa" to "US",
        "united states" to "US", "estados unidos" to "US", "cuba" to "CU",
        "bolivia" to "BO", "marruecos" to "MA",
    )

    private val LANG_CODE_MAP = mapOf(
        "es" to "Español", "en" to "Inglés", "pt" to "Portugués", "fr" to "Francés",
        "de" to "Alemán", "it" to "Italiano", "ar" to "Árabe", "ru" to "Ruso",
        "zh" to "Chino", "ja" to "Japonés", "ko" to "Coreano", "tr" to "Turco",
    )

    private val LANG_FULL = mapOf(
        "español" to "Español", "espanol" to "Español", "spanish" to "Español",
        "castellano" to "Español", "inglés" to "Inglés", "ingles" to "Inglés",
        "english" to "Inglés", "portugués" to "Portugués", "portugues" to "Portugués",
        "portuguese" to "Portugués", "francés" to "Francés", "frances" to "Francés",
        "french" to "Francés", "alemán" to "Alemán", "aleman" to "Alemán",
        "german" to "Alemán", "italiano" to "Italiano", "italian" to "Italiano",
        "árabe" to "Árabe", "arabe" to "Árabe", "arabic" to "Árabe",
    )

    private val QUALITY_PATTERNS = listOf(
        "4K" to Regex("""(?i)(?<![A-Z0-9])(4k|uhd|2160p?)(?![A-Z0-9])"""),
        "FHD" to Regex("""(?i)(?<![A-Z0-9])(fhd|full[\s\-]?hd|1080p?)(?![A-Z0-9])"""),
        "HD" to Regex("""(?i)(?<![A-Z0-9])(hd|720p?)(?![A-Z0-9])"""),
        "SD" to Regex("""(?i)(?<![A-Z0-9])(sd|480p?|360p?)(?![A-Z0-9])"""),
    )

    private val BRACKET_REGEX = Regex("""[\[(\{]([A-Za-z]{2,3})[\])\}]""")
    private val PREFIX_REGEX = Regex("""^\s*([A-Za-z]{2,3})\s*[:|\-.]""")
    private val WORD_RE_CACHE = HashMap<String, Regex>()

    private fun wordBoundary(word: String): Regex =
        WORD_RE_CACHE.getOrPut(word) {
            Regex("""(?<![a-zñáéíóúü])$word(?![a-zñáéíóúü])""")
        }

    data class Tags(
        val countries: Set<String>,
        val languages: Set<String>,
        val qualities: Set<String>,
    )

    fun extract(channel: Channel): Tags {
        val text = listOfNotNull(channel.name, channel.groupTitle).joinToString(" ")
        return Tags(
            countries = extractCountries(text),
            languages = extractLanguages(text),
            qualities = extractQualities(text),
        )
    }

    private fun normalize(code: String): String = when (code) {
        "GB" -> "UK"
        "USA" -> "US"
        else -> code
    }

    private fun extractCountries(text: String): Set<String> {
        val out = LinkedHashSet<String>()
        BRACKET_REGEX.findAll(text).forEach {
            val code = it.groupValues[1].uppercase()
            if (code in COUNTRY_CODES) out.add(normalize(code))
        }
        PREFIX_REGEX.find(text)?.let {
            val code = it.groupValues[1].uppercase()
            if (code in COUNTRY_CODES) out.add(normalize(code))
        }
        val lower = text.lowercase()
        COUNTRY_FULL.forEach { (key, code) ->
            if (wordBoundary(key).containsMatchIn(lower)) out.add(code)
        }
        return out
    }

    private fun extractLanguages(text: String): Set<String> {
        val out = LinkedHashSet<String>()
        val lower = text.lowercase()
        LANG_FULL.forEach { (key, name) ->
            if (wordBoundary(key).containsMatchIn(lower)) out.add(name)
        }
        BRACKET_REGEX.findAll(text).forEach {
            LANG_CODE_MAP[it.groupValues[1].lowercase()]?.let(out::add)
        }
        return out
    }

    private fun extractQualities(text: String): Set<String> {
        for ((label, regex) in QUALITY_PATTERNS) {
            if (regex.containsMatchIn(text)) return setOf(label)
        }
        return emptySet()
    }

    /** Solo calidad — barato, sin los regex de pais/idioma. Devuelve "" si no hay match. */
    fun qualityOf(channel: Channel): String {
        val text = channel.name
        for ((label, regex) in QUALITY_PATTERNS) {
            if (regex.containsMatchIn(text)) return label
        }
        return ""
    }
}
