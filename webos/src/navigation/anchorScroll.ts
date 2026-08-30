// ============================================================
// "Foco fijo" estilo Apple TV: el ítem enfocado queda anclado al
// centro del viewport de su lista y la LISTA se desliza debajo.
// Reemplaza scrollIntoView({block:"nearest"}), que:
//   1. scrollea TODOS los ancestros a la vez (saltos en cascada),
//   2. deja el ítem pegado al borde (el usuario no ve qué viene),
//   3. no anima (salto seco).
// Requiere que los contenedores scrolleables tengan la clase .scroll
// (ya la tienen todos en el código actual).
// ============================================================

let smoothOk: boolean | null = null;
function canSmooth(): boolean {
  if (smoothOk === null) {
    smoothOk = "scrollBehavior" in document.documentElement.style;
  }
  return smoothOk;
}

export function anchorScroll(el: HTMLElement | null): void {
  if (!el) return;
  const sc = el.closest(".scroll") as HTMLElement | null;
  if (!sc) return;

  const er = el.getBoundingClientRect();
  const cr = sc.getBoundingClientRect();

  // Vertical: centrar el ítem (clampeado a los extremos de la lista).
  if (sc.scrollHeight > sc.clientHeight + 1) {
    const dy = er.top + er.height / 2 - (cr.top + cr.height / 2);
    const top = Math.max(
      0,
      Math.min(sc.scrollTop + dy, sc.scrollHeight - sc.clientHeight),
    );
    if (Math.abs(top - sc.scrollTop) > 1) {
      if (canSmooth()) sc.scrollTo({ top, behavior: "smooth" });
      else sc.scrollTop = top;
    }
  }

  // Horizontal (filas tipo "Seguir viendo").
  if (sc.scrollWidth > sc.clientWidth + 1) {
    const dx = er.left + er.width / 2 - (cr.left + cr.width / 2);
    const left = Math.max(
      0,
      Math.min(sc.scrollLeft + dx, sc.scrollWidth - sc.clientWidth),
    );
    if (Math.abs(left - sc.scrollLeft) > 1) {
      if (canSmooth()) sc.scrollTo({ left, behavior: "smooth" });
      else sc.scrollLeft = left;
    }
  }
}
