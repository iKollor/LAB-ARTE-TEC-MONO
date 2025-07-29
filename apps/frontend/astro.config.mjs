// @ts-check
import { defineConfig } from "astro/config";

import node from "@astrojs/node";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const keyPath = path.resolve(__dirname, "../../key.pem");
const certPath = path.resolve(__dirname, "../../cert.pem");

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.warn("[ASTRO][HTTPS] Certificados no encontrados, usando HTTP");
}

let httpsOptions = undefined;
try {
    httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    };
    console.log("[ASTRO][HTTPS] Certificados cargados para desarrollo");
} catch (e) {
    console.warn("[ASTRO][HTTPS] Certificados no encontrados, usando HTTP");
}

export default defineConfig({
    adapter: node({
        mode: "standalone",
    }),

    vite: {
        plugins: [tailwindcss()],
        server: httpsOptions ? { https: httpsOptions } : {},
    },
});
