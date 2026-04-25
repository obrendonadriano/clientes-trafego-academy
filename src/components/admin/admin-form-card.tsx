"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminActionState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AdminFormCardProps = {
  title: string;
  description: string;
  action: (
    state: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  children: React.ReactNode;
  submitLabel: string;
};

const initialState: AdminActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? "Salvando..." : label}
    </Button>
  );
}

export function AdminFormCard({
  title,
  description,
  action,
  children,
  submitLabel,
}: AdminFormCardProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="font-display text-2xl">{title}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 overflow-hidden">
        <form action={formAction} className="min-w-0 space-y-4 overflow-hidden">
          {children}

          {state.error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {state.success}
            </p>
          ) : null}

          <SubmitButton label={submitLabel} />
        </form>
      </CardContent>
    </Card>
  );
}
