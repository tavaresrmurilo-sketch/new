"use client";

import { CalendarHeart, LayoutDashboard, LogOut, Settings, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { logoutAction } from "@/server/auth/actions";
import type { NavUser } from "./nav-items";

export function UserMenu({ user }: { user: NavUser }) {
  return (
    <DropdownMenu>
      <DropdownTrigger className="rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Abrir menu da conta">
        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
      </DropdownTrigger>
      <DropdownContent className="w-64">
        <DropdownLabel className="pb-2">
          <span className="block truncate text-sm font-bold text-foreground">{user.name}</span>
          <span className="block truncate font-medium">{user.email}</span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/perfil">
            <UserRound /> Meu perfil
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/salvos">
            <CalendarHeart /> Minha agenda
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/painel">
            <LayoutDashboard /> {user.hasOrganization ? "Painel do organizador" : "Publicar um evento"}
          </Link>
        </DropdownItem>
        {user.isAdmin && (
          <DropdownItem asChild>
            <Link href="/admin">
              <Shield /> Administração
            </Link>
          </DropdownItem>
        )}
        <DropdownItem asChild>
          <Link href="/perfil/conta">
            <Settings /> Configurações
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <form action={logoutAction}>
          <DropdownItem asChild destructive>
            <button type="submit" className="w-full">
              <LogOut /> Sair
            </button>
          </DropdownItem>
        </form>
      </DropdownContent>
    </DropdownMenu>
  );
}
