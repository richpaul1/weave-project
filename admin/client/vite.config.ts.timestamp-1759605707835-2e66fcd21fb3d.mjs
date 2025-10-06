// client/vite.config.ts
import { defineConfig } from "file:///Users/richard/work/weave-project-dev/admin/node_modules/vite/dist/node/index.js";
import react from "file:///Users/richard/work/weave-project-dev/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "file:///Users/richard/work/weave-project-dev/node_modules/dotenv/lib/main.js";
var __vite_injected_original_import_meta_url = "file:///Users/richard/work/weave-project-dev/admin/client/vite.config.ts";
var __filename = fileURLToPath(__vite_injected_original_import_meta_url);
var __dirname = path.dirname(__filename);
var envPath = path.resolve(__dirname, "../../.env.local");
dotenv.config({ path: envPath });
var adminPort = parseInt(process.env.ADMIN_PORT || "8001", 10);
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    },
    dedupe: ["react", "react-dom"]
  },
  optimizeDeps: {
    include: ["react", "react-dom"]
  },
  root: path.resolve(__dirname),
  server: {
    port: adminPort,
    proxy: {
      "/api": {
        target: `http://localhost:${adminPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/public"),
    emptyOutDir: true
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.test.tsx",
        "**/*.test.ts"
      ]
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiY2xpZW50L3ZpdGUuY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL3JpY2hhcmQvd29yay93ZWF2ZS1wcm9qZWN0LWRldi9hZG1pbi9jbGllbnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9yaWNoYXJkL3dvcmsvd2VhdmUtcHJvamVjdC1kZXYvYWRtaW4vY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9yaWNoYXJkL3dvcmsvd2VhdmUtcHJvamVjdC1kZXYvYWRtaW4vY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJ1xuaW1wb3J0IGRvdGVudiBmcm9tICdkb3RlbnYnXG5cbmNvbnN0IF9fZmlsZW5hbWUgPSBmaWxlVVJMVG9QYXRoKGltcG9ydC5tZXRhLnVybCk7XG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoX19maWxlbmFtZSk7XG5cbi8vIExvYWQgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZyb20gcGFyZW50IC5lbnYubG9jYWxcbmNvbnN0IGVudlBhdGggPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vLmVudi5sb2NhbCcpXG5kb3RlbnYuY29uZmlnKHsgcGF0aDogZW52UGF0aCB9KVxuXG4vLyBHZXQgcG9ydCBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlcyAoYWRtaW4gc2VydmVzIGJvdGggZnJvbnRlbmQgYW5kIGJhY2tlbmQpXG5jb25zdCBhZG1pblBvcnQgPSBwYXJzZUludChwcm9jZXNzLmVudi5BRE1JTl9QT1JUIHx8ICc4MDAxJywgMTApXG5cbi8vIGh0dHBzOi8vdml0ZS5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgfSxcbiAgICBkZWR1cGU6IFsncmVhY3QnLCAncmVhY3QtZG9tJ10sXG4gIH0sXG4gIG9wdGltaXplRGVwczoge1xuICAgIGluY2x1ZGU6IFsncmVhY3QnLCAncmVhY3QtZG9tJ10sXG4gIH0sXG4gIHJvb3Q6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUpLFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiBhZG1pblBvcnQsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6IGBodHRwOi8vbG9jYWxob3N0OiR7YWRtaW5Qb3J0fWAsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi9kaXN0L3B1YmxpYycpLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxuICB9LFxuICB0ZXN0OiB7XG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBlbnZpcm9ubWVudDogJ2hhcHB5LWRvbScsXG4gICAgc2V0dXBGaWxlczogJy4vc3JjL3Rlc3Qvc2V0dXAudHMnLFxuICAgIGNvdmVyYWdlOiB7XG4gICAgICBwcm92aWRlcjogJ3Y4JyxcbiAgICAgIHJlcG9ydGVyOiBbJ3RleHQnLCAnaHRtbCcsICdsY292J10sXG4gICAgICBleGNsdWRlOiBbXG4gICAgICAgICdub2RlX21vZHVsZXMvJyxcbiAgICAgICAgJ3NyYy90ZXN0LycsXG4gICAgICAgICcqKi8qLnRlc3QudHN4JyxcbiAgICAgICAgJyoqLyoudGVzdC50cycsXG4gICAgICBdLFxuICAgIH0sXG4gIH0sXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF3VSxTQUFTLG9CQUFvQjtBQUNyVyxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMscUJBQXFCO0FBQzlCLE9BQU8sWUFBWTtBQUp5TCxJQUFNLDJDQUEyQztBQU03UCxJQUFNLGFBQWEsY0FBYyx3Q0FBZTtBQUNoRCxJQUFNLFlBQVksS0FBSyxRQUFRLFVBQVU7QUFHekMsSUFBTSxVQUFVLEtBQUssUUFBUSxXQUFXLGtCQUFrQjtBQUMxRCxPQUFPLE9BQU8sRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUcvQixJQUFNLFlBQVksU0FBUyxRQUFRLElBQUksY0FBYyxRQUFRLEVBQUU7QUFHL0QsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLFdBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsSUFDQSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQUEsRUFDL0I7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxTQUFTLFdBQVc7QUFBQSxFQUNoQztBQUFBLEVBQ0EsTUFBTSxLQUFLLFFBQVEsU0FBUztBQUFBLEVBQzVCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVEsb0JBQW9CLFNBQVM7QUFBQSxRQUNyQyxjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUSxLQUFLLFFBQVEsV0FBVyxnQkFBZ0I7QUFBQSxJQUNoRCxhQUFhO0FBQUEsRUFDZjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsWUFBWTtBQUFBLElBQ1osVUFBVTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsVUFBVSxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDakMsU0FBUztBQUFBLFFBQ1A7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
