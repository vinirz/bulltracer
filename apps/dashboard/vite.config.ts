import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // O roteamento usa autoCodeSplitting: cada rota vira um chunk carregado via
    // import() dinâmico. Sem isso, o Vite só descobre essas dependências ao
    // navegar pela primeira vez, re-otimizando em tempo de execução e criando
    // uma segunda cópia de React/React DOM para os módulos já carregados —
    // o que quebra o dispatcher de hooks em componentes já montados (ex.:
    // ConnectionSwitcher na Sidebar) durante a transição de rota.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "@tanstack/react-router",
      "motion/react",
      "recharts",
      "lucide-react",
      "zustand",
    ],
  },
  server: {
    // Em dev, /api e /ws são encaminhados ao servidor BullTracer (porta 4000).
    // Assim o frontend usa a mesma origem e o CORS não se aplica ao dev loop.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
      },
    },
  },
});
