import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 2 mobile dev: the phone/emulator must reach the dev server over the LAN,
// so `tauri android dev` / `tauri ios dev` provide TAURI_DEV_HOST. Desktop keeps 127.0.0.1.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host || "127.0.0.1",
    port: 18020,
    strictPort: true,
    hmr: host ? { protocol: "ws", host, port: 18021 } : undefined,
  },
  envPrefix: ["VITE_", "TAURI_"],
}));
