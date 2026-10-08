import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The notes types/geometry/CSS live in the server package so the browser
      // preview and the PDF cannot drift apart.
      "@shared": fileURLToPath(new URL("../server/src/shared", import.meta.url)),
    },
  },
  server: {
    // Deliberately not 5173 so this app can run next to another copy of the
    // project on the same machine.
    port: 5273,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
  preview: { port: 5274 },
});
