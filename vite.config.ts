import { defineConfig } from "vite";

export default defineConfig({
  root: "app/web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "static/main.js",
        chunkFileNames: "static/[name].js",
        assetFileNames: "static/[name][extname]",
      },
    },
  },
});
