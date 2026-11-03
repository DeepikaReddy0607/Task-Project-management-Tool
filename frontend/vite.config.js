import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("chart.js") || id.includes("react-chartjs-2")) {
              return "vendor-charts";
            }
            if (id.includes("react-icons") || id.includes("lucide-react")) {
              return "vendor-icons";
            }
            return "vendor";
          }
        },
      },
    },
  },
});
