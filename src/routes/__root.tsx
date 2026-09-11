import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { BootGate } from "@/components/boot-ready";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorComponent } from "@/lib/error-component";
import appCss from "../styles.css?url";

const APP_NAME = "EXACT V26 · V26 Liga";

const CRITICAL_CSS = `html,body{background:#0b0c0b;color:#eceae4;margin:0;min-height:100%;}
html{--color-accent:#6b9a7a;--color-bg:#0b0c0b;--color-fg:#eceae4;--color-warn:#c4a15a;}
body{font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;}
@media (max-width:767px){aside.fixed{display:none!important}}
a{color:inherit;text-decoration:none}
@keyframes exact-spin{to{transform:rotate(360deg)}}
@keyframes exact-pulse{0%,100%{opacity:.35}50%{opacity:1}}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "EXACT V26 · V26 Liga — analiza meczów ligowych zgodna ze standardem V26. Confidence 0–105, ranking EPL, TOP3 Gate.",
      },
      { name: "theme-color", content: "#0b0c0b" },
      { name: "color-scheme", content: "dark" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
    styles: [{ children: CRITICAL_CSS }],
  }),
  errorComponent: AppErrorComponent,
  component: () => (
    <html
      lang="pl"
      className="antialiased"
      style={{ background: "#0b0c0b", color: "#eceae4" }}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body style={{ background: "#0b0c0b", color: "#eceae4", margin: 0, minHeight: "100dvh" }}>
        <PreviewHostBridge />
        <BootGate />
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <Outlet />
            <Toaster
              theme="dark"
              position="bottom-right"
              toastOptions={{
                className: "bg-elevated text-fg border border-border",
              }}
            />
          </TooltipProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
