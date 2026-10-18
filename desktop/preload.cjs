// Lo único que la app ve de Electron: pantalla completa, salir y la versión.
// Sin acceso a Node ni al sistema de archivos.

const { contextBridge, ipcRenderer } = require("electron");

const versionArg = process.argv.find((a) => a.startsWith("--potri-version="));

contextBridge.exposeInMainWorld("potriDesktop", {
  toggleFullscreen: () => ipcRenderer.invoke("potri:toggle-fullscreen"),
  isFullscreen: () => ipcRenderer.invoke("potri:is-fullscreen"),
  quit: () => ipcRenderer.send("potri:quit"),
  version: versionArg ? versionArg.split("=")[1] : "",
});
