package com.iptv.player.crash

import android.content.Context

object CrashStore {
    private const val PREFS = "crash_prefs"
    private const val KEY_TRACE = "last_trace"
    private const val KEY_TIME = "last_time"

    fun save(context: Context, throwable: Throwable) {
        val sw = java.io.StringWriter()
        throwable.printStackTrace(java.io.PrintWriter(sw))
        runCatching {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_TRACE, sw.toString())
                .putLong(KEY_TIME, System.currentTimeMillis())
                .commit()
        }
    }

    fun consume(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val trace = prefs.getString(KEY_TRACE, null) ?: return null
        prefs.edit().remove(KEY_TRACE).remove(KEY_TIME).apply()
        return trace
    }
}

fun installCrashHandler(context: Context) {
    val appContext = context.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
        CrashStore.save(appContext, throwable)
        previous?.uncaughtException(thread, throwable)
    }
}
