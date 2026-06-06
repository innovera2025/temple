import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            // Build (and test) @wat/shared from its TS source, not its built dist.
            // shared compiles to CommonJS for the CJS API runtime; the web bundler
            // (rollup) can't statically read named exports from that CJS dist, so we
            // point the web build at source — same pattern the API's vitest uses.
            "@wat/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
        }
    },
    server: {
        port: Number(process.env.WEB_PORT ?? 5173)
    },
    test: {
        environment: "jsdom"
    }
});
