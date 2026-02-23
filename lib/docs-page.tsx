"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    SwaggerUIBundle?: ((options: Record<string, unknown>) => { destroy?: () => void }) & {
      presets?: { apis?: unknown };
    };
    SwaggerUIStandalonePreset?: unknown;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src=\"${src}\"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function DocsPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let ui: { destroy?: () => void } | null = null;
    let active = true;

    const mount = async () => {
      await loadScript("/swagger-ui/swagger-ui-bundle.js");
      await loadScript("/swagger-ui/swagger-ui-standalone-preset.js");

      if (!active || !containerRef.current) return;

      const SwaggerUIBundle = window.SwaggerUIBundle as
        | (typeof window.SwaggerUIBundle & { presets?: { apis?: unknown } })
        | undefined;

      if (typeof SwaggerUIBundle !== "function") {
        console.error("Swagger UI bundle not available on window.");
        return;
      }

      const apisPreset = (SwaggerUIBundle as any)["presets"]?.apis;

      ui = SwaggerUIBundle({
        domNode: containerRef.current,
        url: "/api/openapi",
        docExpansion: "none",
        persistAuthorization: true,
        presets: [apisPreset, (window as any).SwaggerUIStandalonePreset].filter(Boolean)
      });
    };

    void mount().catch((error) => {
      console.error("Failed to mount Swagger UI:", error);
    });

    return () => {
      active = false;
      if (ui?.destroy) ui.destroy();
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, []);

  return (
    <>
      <link rel="stylesheet" href="/swagger-ui/swagger-ui.css" />
      <div ref={containerRef}>Loading docs...</div>
    </>
  );
}
