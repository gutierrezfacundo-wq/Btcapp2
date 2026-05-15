package com.iptv.player.data.local

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.iptv.player.data.model.SourceConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "iptv_prefs")

class PreferencesStore(private val context: Context) {

    private object Keys {
        val SourceKind = stringPreferencesKey("source_kind")
        val M3uUrl = stringPreferencesKey("m3u_url")
        val EpgUrl = stringPreferencesKey("epg_url")
        val XServer = stringPreferencesKey("xtream_server")
        val XUser = stringPreferencesKey("xtream_user")
        val XPass = stringPreferencesKey("xtream_pass")
    }

    val source: Flow<SourceConfig?> = context.dataStore.data.map { prefs -> readSource(prefs) }

    private fun readSource(prefs: Preferences): SourceConfig? {
        return when (prefs[Keys.SourceKind]) {
            "m3u" -> {
                val url = prefs[Keys.M3uUrl].orEmpty()
                if (url.isBlank()) null
                else SourceConfig.M3u(url, prefs[Keys.EpgUrl]?.takeIf { it.isNotBlank() })
            }
            "xtream" -> {
                val s = prefs[Keys.XServer].orEmpty()
                val u = prefs[Keys.XUser].orEmpty()
                val p = prefs[Keys.XPass].orEmpty()
                if (s.isBlank() || u.isBlank() || p.isBlank()) null
                else SourceConfig.Xtream(s, u, p)
            }
            else -> null
        }
    }

    suspend fun saveM3u(url: String, epgUrl: String?) {
        context.dataStore.edit { prefs ->
            prefs[Keys.SourceKind] = "m3u"
            prefs[Keys.M3uUrl] = url
            if (epgUrl.isNullOrBlank()) prefs.remove(Keys.EpgUrl) else prefs[Keys.EpgUrl] = epgUrl
        }
    }

    suspend fun saveXtream(server: String, user: String, pass: String) {
        context.dataStore.edit { prefs ->
            prefs[Keys.SourceKind] = "xtream"
            prefs[Keys.XServer] = server
            prefs[Keys.XUser] = user
            prefs[Keys.XPass] = pass
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
