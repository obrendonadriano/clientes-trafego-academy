"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { loginAction, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" size="lg" disabled={pending}>
      {pending ? "Entrando..." : "Acessar portal"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <Card className="border-border/60 bg-card/90 shadow-[0_30px_80px_-36px_rgba(8,18,29,0.55)] backdrop-blur">
      <CardHeader className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/12 p-3 text-primary">
            <LockKeyhole className="size-5" />
          </div>
          <div>
            <CardTitle className="font-display text-2xl">
              Entrar no dashboard
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Somente contas criadas manualmente pelo administrador.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              name="username"
              placeholder="admin ou nome de cliente"
              defaultValue="admin"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Digite sua senha"
              defaultValue="admin"
              required
            />
          </div>

          {state.error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>

        <div className="rounded-3xl border border-border/60 bg-muted/60 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-primary" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Protótipo de desenvolvimento com acesso inicial:
                <strong className="ml-1 text-foreground">admin / admin</strong>
              </p>
              <p>
                Em produção, essa autenticação deve migrar para Supabase Auth
                com credenciais seguras e criação de usuários apenas via admin.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
