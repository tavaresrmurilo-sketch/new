"use client";

import { forwardRef, type AnchorHTMLAttributes } from "react";
import { isNativeApp, openExternal } from "@/lib/native";

/**
 * Link para fora do Mixtour (ingressos, site do organizador). No app nativo abre no
 * navegador embutido do sistema e a pessoa volta ao app com um toque; no site, nova aba.
 */
export const ExternalLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function ExternalLink(
  { href, onClick, target = "_blank", ...props },
  ref,
) {
  return (
    <a
      ref={ref}
      href={href}
      target={target}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !href || !isNativeApp()) return;
        e.preventDefault();
        void openExternal(href);
      }}
      {...props}
    />
  );
});
