// Silueta propia para los jugadores sin foto en la CDN de la NBA (o si la foto no carga), con la misma proporción
// (1040×760) y el mismo encuadre que las fotos: entra en cualquier hueco sin mover nada. Va incrustada, así que
// sale también sin conexión.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 760">
<g fill="#475569"><path d="M520 96c-74 0-120 54-120 142 0 98 42 186 120 186s120-88 120-186c0-88-46-142-120-142z"/><ellipse cx="402" cy="272" rx="17" ry="34"/><ellipse cx="638" cy="272" rx="17" ry="34"/>
<path d="M440 360v96c0 25-13 38-38 47l-136 48c-76 27-112 90-120 209h748c-8-119-44-182-120-209l-136-48c-25-9-38-22-38-47v-96z"/></g>
<path fill="#1e293b" d="M302 538l100-35c14 98 58 157 118 157s104-59 118-157l100 35c-26 66-30 140-24 222H326c6-82 2-156-24-222z"/>
<path fill="none" stroke="#f97316" stroke-width="13" d="M402 503c14 98 58 157 118 157s104-59 118-157"/>
</svg>`;

export const SILHOUETTE = `data:image/svg+xml,${encodeURIComponent(SVG.replaceAll("\n", ""))}`;
