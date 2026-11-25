// Three.js avisa de que `THREE.Clock` está obsoleto, pero quien lo crea es React Three Fiber por dentro (también en
// su última versión, 9.8.2): nuestro código no lo usa. Se calla ese aviso y solo ese; los demás salen igual. Quitar
// este archivo cuando R3F pase a `THREE.Timer`.
import { setConsoleFunction } from "three";

const R3F_CLOCK = "THREE.Clock: This module has been deprecated";

setConsoleFunction((type, message, ...params) => {
  if (type === "warn" && message.startsWith(R3F_CLOCK)) return;
  console[type](message, ...params);
});
