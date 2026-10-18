import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    // Sello de compilación visible en Mis Listas: identifica el .ipk instalado.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // Workers clásicos (IIFE): webOS 6 trae Chromium 79 y los workers de tipo
  // módulo llegaron recién en Chromium 80.
  worker: {
    format: "iife",
  },
  build: {
    outDir: "dist",
    // Chromium 79 (webOS 6) no entiende `??` ni `?.` (llegaron en el 80):
    // con este target esbuild los traduce, en el bundle y en el worker.
    target: ["es2019", "chrome79"],
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          hls: ["hls.js"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
