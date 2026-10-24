import { defineConfig } from "vitest/config";

// The page is served by Vite; requests to /api/... are forwarded to our Node
// server, which is the only part that talks to Canvas.
export default defineConfig({
  root: "src/client",
  server: {
    port: 5173,
    // The trailing slash matters: "/api" alone would also catch the file /api.ts.
    proxy: { "/api/": "http://localhost:3001" },
  },
  test: {
    root: ".",
  },
});
