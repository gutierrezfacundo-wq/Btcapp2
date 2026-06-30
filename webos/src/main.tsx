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
  throttle: 80,
  throttleKeypresses: true,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
