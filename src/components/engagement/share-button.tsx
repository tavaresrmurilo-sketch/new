"use client";

import * as Popover from "@radix-ui/react-popover";
import { Link2, Mail, Send, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { Button } from "@/components/ui/button";
import { isNativeApp, openExternal, shareLink } from "@/lib/native";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  /** Caminho interno (ex.: /evento/slug); a URL absoluta é montada no navegador. */
  path: string;
  title: string;
  text?: string;
  /** Com eventId, cada compartilhamento é registrado nas métricas do evento. */
  eventId?: string;
  variant?: "icon" | "glass" | "button";
  label?: string;
  /** Ocupa toda a largura (variante "button"). */
  block?: boolean;
  className?: string;
}

function trackShare(eventId?: string) {
  if (!eventId) return;
  fetch(`/api/events/${encodeURIComponent(eventId)}/share`, { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Compartilhar: no celular abre a folha nativa (Web Share API); nos demais,
 * um menu com copiar link, WhatsApp, Telegram e e-mail.
 */
export function ShareButton({ path, title, text, eventId, variant = "icon", label = "Compartilhar", block, className }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const absoluteUrl = () => new URL(path, window.location.origin).toString();
  const message = text ?? title;

  const onClick = async () => {
    const url = absoluteUrl();
    // App nativo: folha de compartilhamento do sistema (WhatsApp, Instagram, etc.).
    if (isNativeApp()) {
      if ((await shareLink({ title, text: message, url })) === "shared") trackShare(eventId);
      return;
    }
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: message, url });
        trackShare(eventId);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // a pessoa desistiu
      }
    }
    setOpen((o) => !o);
  };

  const onCopy = async () => {
    const ok = await copyText(absoluteUrl());
    setOpen(false);
    if (ok) {
      toast.success("Link copiado");
      trackShare(eventId);
    } else {
      toast.error("Não foi possível copiar. Copie o endereço na barra do navegador.");
    }
  };

  const external = (href: string) => () => {
    trackShare(eventId);
    setOpen(false);
    void openExternal(href);
  };

  const trigger =
    variant === "button" ? (
      <Button type="button" variant="secondary" block={block} onClick={onClick} aria-haspopup="dialog" aria-expanded={open} className={className}>
        <Share2 /> {label}
      </Button>
    ) : (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90 [&_svg]:size-5",
          variant === "glass" ? "glass border border-white/10 text-foreground shadow-float hover:bg-surface-2" : "bg-surface-2 text-foreground hover:bg-surface-3",
          className,
        )}
      >
        <Share2 aria-hidden />
      </button>
    );

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium outline-none hover:bg-surface-2 focus-visible:bg-surface-2 [&_svg]:size-[18px]";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor ref={anchorRef} className={block ? "flex w-full" : "inline-flex"}>
        {trigger}
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onInteractOutside={(e) => {
            // Clique no próprio botão: quem alterna é o onClick (evita fechar e reabrir).
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="z-[90] w-64 rounded-2xl border border-border bg-elevated p-1.5 text-foreground shadow-float outline-none data-[state=open]:animate-fade-in"
        >
          <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-subtle-foreground">Compartilhar</p>
          <div aria-label="Opções de compartilhamento" className="flex flex-col">
            <button type="button" className={item} onClick={onCopy}>
              <Link2 className="text-primary" /> Copiar link
            </button>
            <button
              type="button"
             
              className={item}
              onClick={() => external(`https://wa.me/?text=${encodeURIComponent(`${message} ${absoluteUrl()}`)}`)()}
            >
              <WhatsAppIcon className="text-[#25D366]" /> WhatsApp
            </button>
            <button
              type="button"
             
              className={item}
              onClick={() => external(`https://t.me/share/url?url=${encodeURIComponent(absoluteUrl())}&text=${encodeURIComponent(message)}`)()}
            >
              <Send className="text-[#229ED9]" /> Telegram
            </button>
            <button
              type="button"
             
              className={item}
              onClick={() => {
                trackShare(eventId);
                setOpen(false);
                window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${message}\n\n${absoluteUrl()}`)}`;
              }}
            >
              <Mail className="text-muted-foreground" /> E-mail
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
