// Cabecera fija de una tabla con scroll horizontal (Tarea 6.20; también el explorador de la 6.22). La cabecera
// de verdad vive dentro del scroll lateral y no puede fijarse en vertical: se pinta una copia encima, con los
// mismos anchos y el mismo desplazamiento lateral, que solo se ve cuando la de verdad ha subido por encima.
"use client";

import { useEffect, useRef, useState } from "react";

/** Pone a cada celda de la copia de la cabecera el ancho de la de la tabla (y a la copia, el de la tabla). */
function copyWidths(real: HTMLTableElement | null, clone: HTMLTableElement | null) {
  const source = real?.tHead?.rows[0]?.cells;
  const target = clone?.tHead?.rows[0]?.cells;
  if (!real || !clone || !source || !target) return;
  clone.style.width = `${real.getBoundingClientRect().width}px`;
  for (let i = 0; i < target.length; i++) target[i].style.width = `${source[i]?.getBoundingClientRect().width ?? 0}px`;
}

/**
 * Refs para el ancla fija (`anchorRef`, a la altura donde debe quedarse la copia), la caja de la copia, la
 * copia, el contenedor con scroll lateral y la tabla. `floating` = enseñar la copia.
 */
export function useFloatingHead() {
  const anchor = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLTableElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [floating, setFloating] = useState(false);

  const syncScroll = () => {
    if (box.current && scroller.current) box.current.scrollLeft = scroller.current.scrollLeft;
  };

  // Tras cada render (columnas, orden o datos pueden cambiar los anchos): pocas celdas, nada que pese
  useEffect(() => {
    copyWidths(table.current, copy.current);
    if (box.current && scroller.current) box.current.scrollLeft = scroller.current.scrollLeft;
  });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const head = table.current?.tHead;
      const top = anchor.current?.getBoundingClientRect().top;
      if (!head || top === undefined) return;
      const rect = head.getBoundingClientRect();
      const tableBottom = table.current!.getBoundingClientRect().bottom;
      // Fija mientras la cabecera de verdad está por encima del ancla y aún queda tabla debajo
      setFloating(rect.top < top - 1 && tableBottom > top + rect.height);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(() => {
      copyWidths(table.current, copy.current);
      schedule();
    });
    if (table.current) resize.observe(table.current);
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return { anchorRef: anchor, boxRef: box, copyRef: copy, scrollerRef: scroller, tableRef: table, floating, syncScroll };
}
