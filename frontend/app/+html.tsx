import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * Guscio HTML del sito web/PWA (solo web). Inietta i meta tag necessari per
 * l'installazione su iPhone via Safari → "Aggiungi a Home".
 */
export default function Root({ children }: PropsWithChildren) {
  // Prefisso del percorso di hosting (es. "/strategie" su GitHub Pages, "" in locale).
  const base = (process.env.EXPO_BASE_URL || "").replace(/\/$/, "");
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />

        {/* PWA installabile su iPhone (Safari → Condividi → Aggiungi a Home) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="FTMO Strategy" />
        <meta name="application-name" content="FTMO Strategy" />
        <meta name="theme-color" content="#000000" />
        <meta
          name="description"
          content="Genera e mantieni strategie di trading conformi FTMO. Scalping, Day Trading, Swing Trading."
        />

        <link rel="manifest" href={`${base}/manifest.json`} />
        <link rel="apple-touch-icon" href={`${base}/icon-180.png`} />
        <link rel="icon" type="image/png" href={`${base}/icon-192.png`} />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body { background-color: #F4F4F2; }
@media (prefers-color-scheme: dark) { body { background-color: #F4F4F2; } }
`;
