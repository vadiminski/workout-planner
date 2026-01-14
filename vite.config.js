import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // IMPORTANT: Replace 'your-repo-name' with the actual name of your GitHub repository
  base: "/workout-planner/",

  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "My Workout App",
        short_name: "Workout",
        description: "Personal Workout Tracker",
        theme_color: "#0f172a", // Matches your bg-slate-900
        background_color: "#0f172a",
        display: "standalone", // Removes the browser URL bar
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
