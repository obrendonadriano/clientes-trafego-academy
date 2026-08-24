"use client";

import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Menu,
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
  relatorios: FileText,
  config: Settings,
  perfil: User,
  fechamento: Receipt,
  conversoes: Sparkles,
  mais: Menu,
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
