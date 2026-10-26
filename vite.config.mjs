import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    // Windows may exclusively lock downloaded test archives while saving them.
    // Generated evidence and caches are not app source and must not crash FSWatcher.
    watch: { ignored: ['**/qa/**', '**/audit-*/**', '**/.npm-cache/**', '**/.tools/**', '**/*.yhf'] },
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
