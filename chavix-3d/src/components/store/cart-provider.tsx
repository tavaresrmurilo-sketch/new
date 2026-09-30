"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  addCustomToCart,
  addProductToCart,
  applyCoupon,
  removeCartItem,
  removeCoupon,
  updateCartItemQuantity,
} from "@/app/actions/cart";
import { EMPTY_CART, type CartActionResult, type CartView } from "@/lib/cart/types";

interface CartContextValue {
  cart: CartView;
  ready: boolean;
  pending: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  bump: number;
  refresh: () => Promise<void>;
  reset: () => void;
  addProduct: (input: Parameters<typeof addProductToCart>[0], options?: { openDrawer?: boolean }) => Promise<boolean>;
  addCustom: (input: Parameters<typeof addCustomToCart>[0]) => Promise<boolean>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  applyCouponCode: (code: string) => Promise<boolean>;
  clearCoupon: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartView>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cart", { cache: "no-store" });
      if (response.ok) setCart(await response.json());
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async (action: () => Promise<CartActionResult>, successToast = false): Promise<boolean> => {
    let result: CartActionResult;
    try {
      result = await action();
    } catch {
      toast.error("Não foi possível atualizar o carrinho. Verifique sua conexão.");
      return false;
    }
    if (result.cart) startTransition(() => setCart(result.cart!));
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    if (successToast && result.message) toast.success(result.message);
    return true;
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      ready,
      pending,
      drawerOpen,
      setDrawerOpen,
      bump,
      refresh,
      reset: () => setCart(EMPTY_CART),
      addProduct: async (input, options) => {
        const ok = await run(() => addProductToCart(input));
        if (ok) {
          setBump((b) => b + 1);
          if (options?.openDrawer !== false) setDrawerOpen(true);
        }
        return ok;
      },
      addCustom: async (input) => {
        const ok = await run(() => addCustomToCart(input));
        if (ok) {
          setBump((b) => b + 1);
          setDrawerOpen(true);
        }
        return ok;
      },
      setQuantity: async (itemId, quantity) => {
        await run(() => updateCartItemQuantity(itemId, quantity));
      },
      remove: async (itemId) => {
        await run(() => removeCartItem(itemId));
      },
      applyCouponCode: (code) => run(() => applyCoupon(code), true),
      clearCoupon: async () => {
        await run(() => removeCoupon());
      },
    }),
    [cart, ready, pending, drawerOpen, bump, refresh, run],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart precisa estar dentro de <CartProvider>");
  return context;
}
