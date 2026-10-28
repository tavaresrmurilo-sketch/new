import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/painel");
  return <SignUpForm />;
}
