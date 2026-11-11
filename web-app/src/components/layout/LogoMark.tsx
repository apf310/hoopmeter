/**
 * Símbolo de la marca: balón sobre un ojo cerrado (sin spoilers) cuyas pestañas son la escala
 * de la nota, con los mismos colores que la app (rojo, ámbar, esmeralda). Fondo transparente.
 * Debe coincidir con assets/logo.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="70 61 372 372" className={className} aria-hidden>
      <g transform="translate(0 26)">
        <circle cx="256" cy="146" r="70" fill="#f97316" />
        <g fill="none" stroke="#020617" strokeWidth="8.4" strokeLinecap="round">
          <path d="M186 146h140" />
          <path d="M256 76v140" />
          <path d="M212.6 91.4c18.2 15.4 26.6 33.6 26.6 54.6s-8.4 39.2-26.6 54.6" />
          <path d="M299.4 91.4c-18.2 15.4-26.6 33.6-26.6 54.6s8.4 39.2 26.6 54.6" />
        </g>
        <g strokeLinecap="round" strokeWidth="28">
          <path d="M128.1 261.3L101.7 299" stroke="#ef4444" />
          <path d="M191.9 294.7L176.7 338.1" stroke="#f59e0b" />
          <path d="M256 306V352" stroke="#f59e0b" />
          <path d="M320.1 294.7L335.3 338.1" stroke="#10b981" />
          <path d="M383.9 261.3L410.3 299" stroke="#10b981" />
        </g>
        <path d="M96 236Q256 376 416 236" fill="none" stroke="#f8fafc" strokeWidth="34" strokeLinecap="round" />
      </g>
    </svg>
  );
}
