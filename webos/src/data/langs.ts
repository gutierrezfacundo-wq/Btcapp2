// Matching tolerante de idiomas de pistas: los proveedores etiquetan como
// quieren ("spa", "Español", "LAT", "es-419"...), así que comparamos contra
// alias conocidos por idioma preferido.

const LANG_ALIASES: Record<string, string[]> = {
  es: ["es", "spa", "esp", "spanish", "español", "espanol", "castellano", "latino", "lat", "la", "es-419"],
  en: ["en", "eng", "english", "ingles", "inglés"],
  pt: ["pt", "por", "portuguese", "portugues", "português", "pt-br", "brazil"],
};

export function langMatches(value: string | undefined | null, pref: string): boolean {
  if (!value || !pref) return false;
  const v = value.toLowerCase().trim();
  return (LANG_ALIASES[pref] ?? [pref]).some((a) => v === a || v.includes(a));
}

export const AUDIO_LANG_OPTIONS = [
  { id: "", label: "Sin preferencia" },
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
  { id: "pt", label: "Portugués" },
];

export const SUB_LANG_OPTIONS = [
  { id: "", label: "Sin preferencia" },
  { id: "off", label: "Desactivados" },
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
];
