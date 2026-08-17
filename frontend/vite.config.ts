import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /** เปิดจากมือถือใน Wi‑Fi เดียวกัน: http://<IP-PC>:5173 */
    host: true,
    /** Cloudflare Tunnel / custom domain */
    allowedHosts: ["allforone.ma-well.com"],
    proxy: {
      /** 127.0.0.1 ลดปัญหา localhost→IPv6 (::1) บน Windows ที่ API ฟังแค่ IPv4 */
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: ["allforone.ma-well.com"],
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
});
