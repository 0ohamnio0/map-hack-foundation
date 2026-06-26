import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: process.env.VERCEL ? "/" : "/map-hack-foundation/",
  // 관객에게 서브되는 프로덕션 빌드에선 개발용 로그 제거 — console.log/info/debug + debugger를
  // 미니파이 단계에서 dead-code로 떨어뜨린다. console.error/warn(실오류·경고)은 유지.
  // (dev/HMR 빌드에선 그대로 둬서 디버깅 가능)
  esbuild: {
    pure: mode === "production" ? ["console.log", "console.info", "console.debug"] : [],
    drop: mode === "production" ? ["debugger"] : [],
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: true,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force single Three.js instance — prevents ecctrl / R3F dual-import conflict
      "three": path.resolve(__dirname, "./node_modules/three"),
    },
  },
}));

