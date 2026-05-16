import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
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
