import type { ParentProps } from "solid-js";
import { HydrationScript } from "@solidjs/web";

// The document shell — the new index.html: picked up by the src/Document.*
// convention, it wraps the app in the plugin's generated entries and must
// render the full <html>. Head tags go here. It is compiled only into the
// prerendered static shell and ships zero client-side JS: in client mode
// <HydrationScript /> is stripped from the shell, and it activates when the
// app flips to SSR (`ssr: true` in vite.config.ts) — no document changes
// needed. Delete this file to fall back to the plugin's built-in shell.
export default function Document(props: ParentProps) {
  // `lang` matches the default the client picks (Russian) and is corrected by
  // the App effect the moment the stored or detected language differs: the
  // shell is prerendered, so it cannot know the visitor's choice.
  return (
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        {/* `viewport-fit=cover` lets the app paint under the notch/home bar —
            the layout then reserves the space with env(safe-area-inset-*).
            Zoom stays available: the fields are 16px on touch so iOS has no
            reason to zoom on focus. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* Favicon pack (public/): browsers, iOS, Windows tiles. No web manifest
            on purpose — Chrome downloads manifest icons (192/512) on every load
            for installability checks, and this is not a PWA. */}
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="./favicon-32x32.png"
        />
        <link rel="shortcut icon" href="./favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="./apple-touch-icon-180x180.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="./apple-touch-icon-152x152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="./apple-touch-icon-120x120.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="76x76"
          href="./apple-touch-icon-76x76.png"
        />
        <meta name="msapplication-TileImage" content="./mstile-150x150.png" />
        <meta name="msapplication-TileColor" content="#09090b" />
        <meta name="msapplication-config" content="./browserconfig.xml" />
        <meta name="theme-color" content="#09090b" />
        <meta name="apple-mobile-web-app-title" content="reline-web" />
        <meta name="application-name" content="reline-web" />
        <title>reline-web</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
