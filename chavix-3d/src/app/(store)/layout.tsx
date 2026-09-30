import { BottomNav } from "@/components/store/bottom-nav";
import { CartDrawer } from "@/components/store/cart-drawer";
import { CartProvider } from "@/components/store/cart-provider";
import { Footer } from "@/components/store/footer";
import { Header } from "@/components/store/header";
import { SearchDialog } from "@/components/store/search-dialog";

// Catálogo, preços e estoque vêm do banco a cada requisição: o que o admin muda aparece na hora.
export const dynamic = "force-dynamic";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-white">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" className="min-h-[60vh]">
        {children}
      </main>
      <Footer />
      <BottomNav />
      <CartDrawer />
      <SearchDialog />
    </CartProvider>
  );
}
