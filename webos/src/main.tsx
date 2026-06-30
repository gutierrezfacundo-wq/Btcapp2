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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
