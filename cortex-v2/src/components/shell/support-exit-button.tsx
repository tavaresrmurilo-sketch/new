"use client";

import { useRouter } from "next/navigation";
import { exitSupportModeAction } from "@/features/admin/support-actions";

export function SupportExitButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded bg-black/85 px-2 py-0.5 text-xs font-semibold text-white hover:bg-black"
      onClick={async () => {
        await exitSupportModeAction();
        router.push("/admin/organizations");
        router.refresh();
      }}
    >
      Sair do modo suporte
    </button>
  );
}
