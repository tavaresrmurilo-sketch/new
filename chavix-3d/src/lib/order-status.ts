import type { OrderStatus, ShippingMethod } from "@/generated/prisma/enums";

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_REVIEW",
  "PAID",
  "IN_PRODUCTION",
  "READY",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const satisfies readonly OrderStatus[];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Aguardando pagamento",
  PAYMENT_REVIEW: "Pagamento em análise",
  PAID: "Pago",
  IN_PRODUCTION: "Em produção",
  READY: "Pronto",
  SHIPPED: "Enviado",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

/** Explicação curta mostrada ao cliente em cada etapa. */
export const STATUS_DESCRIPTION: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pedido criado. Falta o Pix.",
  PAYMENT_REVIEW: "Você avisou que pagou. Estamos conferindo o Pix.",
  PAID: "Pagamento confirmado. Seu pedido entrou na fila.",
  IN_PRODUCTION: "Na impressora, camada por camada.",
  READY: "Impresso, revisado e embalado.",
  SHIPPED: "A caminho.",
  DELIVERED: "Chegou. Aproveite!",
  CANCELLED: "Este pedido foi cancelado.",
};

export type StatusTone = "neutral" | "waiting" | "active" | "success" | "danger";

export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  PENDING_PAYMENT: "waiting",
  PAYMENT_REVIEW: "waiting",
  PAID: "active",
  IN_PRODUCTION: "active",
  READY: "active",
  SHIPPED: "active",
  DELIVERED: "success",
  CANCELLED: "danger",
};

/** Transições que o administrador pode fazer, por status de origem. */
const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAYMENT_REVIEW: ["PAID", "PENDING_PAYMENT", "CANCELLED"],
  PAID: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY", "CANCELLED"],
  READY: ["SHIPPED", "DELIVERED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canAdminTransition(from: OrderStatus, to: OrderStatus, method: ShippingMethod): boolean {
  if (!ADMIN_TRANSITIONS[from].includes(to)) return false;
  // Pedido para envio nacional precisa passar por "Enviado" antes de "Entregue".
  if (from === "READY" && to === "DELIVERED" && method === "NATIONAL") return false;
  // Retirada não tem etapa de envio.
  if (to === "SHIPPED" && method === "PICKUP") return false;
  return true;
}

export function adminTransitionsFor(from: OrderStatus, method: ShippingMethod): OrderStatus[] {
  return ADMIN_TRANSITIONS[from].filter((to) => canAdminTransition(from, to, method));
}

/** O cliente só pode avisar que pagou. Nunca pode marcar como pago. */
export function canCustomerTransition(from: OrderStatus, to: OrderStatus): boolean {
  return from === "PENDING_PAYMENT" && to === "PAYMENT_REVIEW";
}

/** Texto do botão de cada ação do painel. */
export const ADMIN_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  PAID: "Confirmar pagamento",
  PENDING_PAYMENT: "Pagamento não identificado",
  IN_PRODUCTION: "Iniciar produção",
  READY: "Marcar como pronto",
  SHIPPED: "Marcar como enviado",
  DELIVERED: "Marcar como entregue",
  CANCELLED: "Cancelar pedido",
};

/** Etapas da linha do tempo exibida ao cliente, conforme o tipo de entrega. */
export function timelineSteps(method: ShippingMethod): OrderStatus[] {
  const base: OrderStatus[] = ["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "IN_PRODUCTION", "READY"];
  return method === "PICKUP" ? [...base, "DELIVERED"] : [...base, "SHIPPED", "DELIVERED"];
}

export function statusLabelFor(status: OrderStatus, method: ShippingMethod): string {
  if (method === "PICKUP" && status === "DELIVERED") return "Retirado";
  if (method === "PICKUP" && status === "READY") return "Pronto para retirada";
  if (method === "LOCAL_DELIVERY" && status === "SHIPPED") return "Saiu para entrega";
  return STATUS_LABEL[status];
}
