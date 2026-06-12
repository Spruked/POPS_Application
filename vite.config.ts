import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 18020,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
}));