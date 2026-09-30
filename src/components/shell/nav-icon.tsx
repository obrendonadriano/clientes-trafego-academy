"use client";

import {
  BarChart3,
  Bot,
  LayoutDashboard,
  Receipt,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import type { NavIconKey } from "@/lib/navigation";

const ICONS = {
  visao: LayoutDashboard,
  clientes: Users,
  campanhas: BarChart3,
  config: Settings,
  perfil: User,
  fechamento: Receipt,
  conversoes: Sparkles,
  "atendimento-ia": Bot,
} as const satisfies Record<NavIconKey, unknown>;

export function NavIcon({
  name,
  className,
}: {
  name: NavIconKey;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={1.75} />;
}
