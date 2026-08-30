-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keep,includedescriptorclasses class com.iptv.player.**$$serializer { *; }
-keepclassmembers class com.iptv.player.** {
    *** Companion;
}
-keepclasseswithmembers class com.iptv.player.** {
    kotlinx.serialization.KSerializer serializer(...);
}
