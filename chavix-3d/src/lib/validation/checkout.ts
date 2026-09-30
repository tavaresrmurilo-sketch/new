import { z } from "zod";
import { cepField, emailField, optionalText, phoneBR, text, ufField } from "./common";

const address = z.object({
  cep: cepField,
  street: text(2, 120, "Informe a rua"),
  number: text(1, 20, "Informe o número"),
  complement: optionalText(80),
  district: text(2, 80, "Informe o bairro"),
  city: text(2, 80, "Informe a cidade"),
  state: ufField,
});

export const checkoutSchema = z.discriminatedUnion("shippingMethod", [
  z.object({
    shippingMethod: z.literal("PICKUP"),
    name: text(3, 100, "Informe seu nome completo"),
    phone: phoneBR,
    email: emailField,
    notes: optionalText(600),
    acceptTerms: z.literal(true, { message: "Aceite os termos para continuar" }),
  }),
  z.object({
    shippingMethod: z.enum(["LOCAL_DELIVERY", "NATIONAL"]),
    name: text(3, 100, "Informe seu nome completo"),
    phone: phoneBR,
    email: emailField,
    notes: optionalText(600),
    acceptTerms: z.literal(true, { message: "Aceite os termos para continuar" }),
    address,
  }),
]);

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const trackingSchema = z.object({
  code: z.string().trim().min(6).max(20),
  contact: z.string().trim().min(4, "Informe o e-mail ou telefone usado na compra").max(160),
});
