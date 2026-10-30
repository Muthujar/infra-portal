import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development, calls to /api are forwarded to the backend on port 4000.
// So the front end can always call "/api/..." without worrying about CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
