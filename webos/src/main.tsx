import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { init as initSpatial } from "@noriginmedia/norigin-spatial-navigation";
import App from "./App";
import "./styles/global.css";
import "./styles/aurora.css";

initSpatial({
  debug: false,
  visualDebug: false,
  // Sin throttle el foco responde inmediato a cada pulsacion del D-pad.
  throttle: 0,
  throttleKeypresses: false,
});

// Escala el stage 1920x1080 para llenar la pantalla real (4K, ventana de PC, etc.)
// manteniendo las coordenadas de diseño. Centra con letterbox si el aspecto difiere.
function fitStage() {
  const root = document.getElementById("root");
  if (!root) return;
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const x = Math.round((window.innerWidth - 1920 * s) / 2);
  const y = Math.round((window.innerHeight - 1080 * s) / 2);
  root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
}
window.addEventListener("resize", fitStage);
window.addEventListener("orientationchange", fitStage);
fitStage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);

fitStage();
