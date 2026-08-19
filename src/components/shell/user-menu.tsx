"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { useDismiss } from "@/components/shell/use-dismiss";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import type { User } from "@/lib/types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function UserMenu({ user }: { user: User }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Abrir menu da conta"
        className="grid size-8 place-items-center rounded-full bg-primary/[0.22] text-[0.72rem] font-semibold text-primary transition hover:bg-primary/30"
      >
        {initials(user.name)}
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-56 overflow-hidden rounded-xl border border-border/70 bg-popover p-3 shadow-2xl dark:border-white/10"
        >
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.role === "admin" ? "Administrador" : (user.clientName ?? "Cliente")}
          </p>

          <form action={logoutAction} className="mt-3">
            <FormPendingButton
              variant="outline"
              className="w-full gap-2 rounded-lg"
              idleLabel="Sair"
              pendingLabel="Saindo..."
            >
              <LogOut className="size-4 shrink-0" />
              <span>Sair</span>
            </FormPendingButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
