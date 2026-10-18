"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { NativeBridge } from "@/components/native/native-bridge";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <NativeBridge />
        {children}
        <Toaster
          position="top-center"
          offset={16}
          mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border !border-border !bg-elevated !text-foreground !shadow-float !font-sans",
              description: "!text-muted-foreground",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
