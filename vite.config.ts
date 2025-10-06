import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  plugins: [
    preact({
      prerender: {
        enabled: true,
        renderTarget: "#app",
        additionalPrerenderRoutes: ["/404.html", "/search"],
        previewMiddlewareEnabled: true,
        previewMiddlewareFallback: "/404.html",
      },
    }),
  ],
  build: {
    cssCodeSplit: false,
  },
});
