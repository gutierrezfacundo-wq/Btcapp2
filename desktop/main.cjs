// POTRI para PC: la misma app de la TV (webos/) corriendo en una ventana de
// Electron. Acá solo vive lo que la ventana necesita; la app es la de siempre.

const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("node:path");

// Los paneles Xtream a veces rechazan clientes raros: nos presentamos como un
// Chrome común, sin los agregados "Electron/x" y "POTRI/x" del user agent.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/i, "")
  .replace(/\s(POTRI|potri-desktop)\/\S+/i, "");

// Una sola ventana: abrirla de nuevo trae al frente la que ya está.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let win = null;

function createWindow() {
  win = new BrowserWindow({
    // 16:9 como la TV: la app se dibuja a 1920x1080 y se escala a la ventana,
    // así que en otra proporción quedan bandas.
    width: 1280,
    height: 720,
    useContentSize: true,
    minWidth: 960,
    minHeight: 540,
    title: "POTRI",
    backgroundColor: "#0a0a0c",
    icon: path.join(__dirname, "resources", "icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Los servidores Xtream no mandan cabeceras CORS: en un navegador la app
      // no podría ni leer la lista. En la TV no pasa porque corre como app
      // instalada; acá hacemos lo mismo. Es seguro porque esta ventana solo
      // carga los archivos de la app que vienen adentro del programa (la
      // navegación a cualquier otra página está bloqueada más abajo) y no
      // tiene acceso a Node.
      webSecurity: false,
      autoplayPolicy: "no-user-gesture-required",
      spellcheck: false,
      additionalArguments: [`--potri-version=${app.getVersion()}`],
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.once("ready-to-show", () => {
    win?.maximize();
    win?.show();
  });

  const contents = win.webContents;

  // Nunca salir de la app: los links externos se abren en el navegador.
  contents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Teclado de PC: F11 pantalla completa, Escape sale de ella (sin que la app
  // lo tome también como "volver"), F12 herramientas de diagnóstico.
  contents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      e.preventDefault();
      win?.setFullScreen(!win.isFullScreen());
    } else if (input.key === "Escape" && win?.isFullScreen()) {
      e.preventDefault();
      win.setFullScreen(false);
    } else if (input.key === "F12") {
      e.preventDefault();
      contents.toggleDevTools();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

ipcMain.handle("potri:toggle-fullscreen", () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle("potri:is-fullscreen", () => !!win?.isFullScreen());
ipcMain.on("potri:quit", () => app.quit());

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  // La app no pide cámara, micrófono ni ubicación: todo denegado salvo la
  // pantalla completa del video.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === "fullscreen");
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
