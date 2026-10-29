// Códigos cortos legibles (sin O/0/I/1) para vincular el celular. Salen del
// generador criptográfico: con Math.random se podrían adivinar.
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let s = "";
  // 32 símbolos: 256 es múltiplo exacto, así que el módulo no sesga.
  for (let i = 0; i < length; i++) s += ABC[bytes[i] % ABC.length];
  return s;
}
