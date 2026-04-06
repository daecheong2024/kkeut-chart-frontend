import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to backend
      '/api': {
        target: 'http://localhost:5255',
        changeOrigin: true,
      },
      // Proxy SignalR Hub (both HTTP and WebSocket)
      '/signalr': {
        target: 'http://localhost:5255',
        changeOrigin: true,
        ws: true,
      }
    }
  }
});
