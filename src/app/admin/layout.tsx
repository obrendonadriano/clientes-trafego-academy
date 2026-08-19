import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellContainer } from "@/components/shell/app-shell-container";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  return <AppShellContainer user={user}>{children}</AppShellContainer>;
}
