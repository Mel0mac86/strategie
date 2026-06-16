// Post-export: inietta i meta tag PWA in dist/index.html (output "single").
// In modalità SPA, Expo non usa app/+html.tsx, quindi i tag per l'installazione
// su iPhone (Aggiungi a Home) vengono aggiunti qui. Idempotente.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");
const indexPath = resolve(dist, "index.html");

if (!existsSync(indexPath)) {
  console.error("[patch-html] dist/index.html non trovato. Esegui prima l'export web.");
  process.exit(1);
}

const base = (process.env.EXPO_BASE_URL || "").replace(/\/$/, "");

const tags = `
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <meta name="apple-mobile-web-app-title" content="FTMO Strategy" />
    <meta name="application-name" content="FTMO Strategy" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Genera e mantieni strategie di trading conformi FTMO. Scalping, Day Trading, Swing Trading." />
    <link rel="manifest" href="${base}/manifest.json" />
    <link rel="apple-touch-icon" href="${base}/icon-180.png" />
    <link rel="icon" type="image/png" href="${base}/icon-192.png" />
`;

let html = readFileSync(indexPath, "utf8");

// lang it
html = html.replace(/<html lang="[^"]*">/, '<html lang="it">');

// inietta i tag una sola volta, prima di </head>
if (!html.includes("apple-mobile-web-app-capable")) {
  html = html.replace("</head>", `${tags}  </head>`);
}

writeFileSync(indexPath, html);

// SPA fallback: GitHub Pages serve 404.html per i percorsi sconosciuti, così
// refresh e deep-link (es. /strategie/calculator) riavviano comunque l'app.
copyFileSync(indexPath, resolve(dist, "404.html"));

console.log(`[patch-html] index.html + 404.html aggiornati (base="${base || "/"}").`);
