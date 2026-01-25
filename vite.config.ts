import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ isSsrBuild, mode }) => ({
  build: {
    // Enable source maps for debugging but don't include in production
    sourcemap: mode === "development",
    // Set reasonable chunk size warning limit
    chunkSizeWarningLimit: 500,
    rollupOptions: isSsrBuild
      ? {
          input: "./server/app.ts",
        }
      : {
          output: {
            // Manual chunk splitting for optimal caching
            manualChunks: (id) => {
              // Vendor chunks for third-party libraries
              if (id.includes("node_modules")) {
                // React and React DOM in separate chunk
                if (id.includes("react") || id.includes("react-dom")) {
                  return "vendor-react";
                }
                // Supabase in separate chunk (used heavily in game)
                if (id.includes("@supabase")) {
                  return "vendor-supabase";
                }
                // UI libraries
                if (id.includes("@radix-ui") || id.includes("lucide-react")) {
                  return "vendor-ui";
                }
                // Animation libraries
                if (id.includes("motion") || id.includes("simplex-noise")) {
                  return "vendor-animation";
                }
                // Other vendor code
                return "vendor";
              }
              // Game-specific chunks
              if (id.includes("/app/components/Game")) {
                return "game-board";
              }
              if (id.includes("/app/components/") && 
                  (id.includes("Voting") || id.includes("Team") || id.includes("Assassination"))) {
                return "game-phases";
              }
              if (id.includes("/app/registry/") || id.includes("/app/services/")) {
                return "game-engine";
              }
              if (id.includes("/app/hooks/")) {
                return "hooks";
              }
              // Let everything else be handled by default splitting
              return undefined;
            },
            // Consistent chunk naming for caching
            chunkFileNames: (chunkInfo) => {
              const facadeModuleId = chunkInfo.facadeModuleId
                ? chunkInfo.facadeModuleId.split("/").pop()?.replace(/\.\w+$/, "")
                : "chunk";
              return `assets/${chunkInfo.name || facadeModuleId}-[hash].js`;
            },
            assetFileNames: "assets/[name]-[hash][extname]",
            entryFileNames: "assets/[name]-[hash].js",
          },
        },
  },
  plugins: [
    tailwindcss(),
    // Disable React Router plugin during tests to avoid preamble detection issues
    mode !== "test" && reactRouter(),
    tsconfigPaths(),
  ].filter(Boolean),
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
  },
}));
