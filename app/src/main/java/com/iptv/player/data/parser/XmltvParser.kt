package com.iptv.player.data.parser

import android.util.Xml
import com.iptv.player.data.model.EpgProgram
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object XmltvParser {

    private val formats = listOf(
        "yyyyMMddHHmmss Z",
        "yyyyMMddHHmmss",
    ).map { SimpleDateFormat(it, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") } }

    fun parse(input: InputStream): List<EpgProgram> {
        val parser = Xml.newPullParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        parser.setInput(input, null)

        val programs = mutableListOf<EpgProgram>()
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && parser.name == "programme") {
                val start = parser.getAttributeValue(null, "start")
                val stop = parser.getAttributeValue(null, "stop")
                val channel = parser.getAttributeValue(null, "channel").orEmpty()
                var title: String? = null
                var desc: String? = null

                var inner = parser.next()
                while (!(inner == XmlPullParser.END_TAG && parser.name == "programme")) {
                    if (inner == XmlPullParser.START_TAG) {
                        when (parser.name) {
                            "title" -> title = parser.nextText().trim()
                            "desc" -> desc = parser.nextText().trim()
                        }
                    }
                    inner = parser.next()
                }

                val startMs = parseDate(start)
                val stopMs = parseDate(stop)
                if (channel.isNotBlank() && title != null && startMs != null && stopMs != null) {
                    programs.add(EpgProgram(channel, title, desc, startMs, stopMs))
                }
            }
            event = parser.next()
        }
        return programs
    }

    private fun parseDate(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        for (fmt in formats) {
            try {
                return fmt.parse(value)?.time
            } catch (_: Exception) { /* try next */ }
        }
        return null
    }
}
