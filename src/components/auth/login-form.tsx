"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { loginAction, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="h-14 w-full rounded-2xl bg-[linear-gradient(135deg,#4d7cff_0%,#815cff_55%,#b787ff_100%)] text-sm font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_16px_40px_rgba(114,92,255,0.28)] hover:brightness-105"
      size="lg"
      disabled={pending}
    >
      <span>{pending ? "Entrando..." : "Acessar portal"}</span>
      <ArrowRight className="size-5" />
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <div className="flex h-full flex-col">
      <div>
        <p className="text-sm font-semibold text-[#a4a8b0] sm:text-base">
          Seja bem-vindo ao portal
        </p>
        <h2 className="mt-3 max-w-[12ch] font-display text-[2.3rem] leading-[0.98] tracking-[-0.06em] text-[#090909] sm:text-[3.2rem]">
          Faça login para acompanhar suas campanhas
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#7f8794] sm:text-base">
          Use o acesso liberado manualmente pela equipe da Tráfego Academy para
          entrar no seu dashboard de métricas.
        </p>
      </div>

      <form action={formAction} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-semibold text-[#636b78]">
            Usuário
          </Label>
          <Input
            id="username"
            name="username"
            placeholder="Digite seu usuário"
            autoComplete="username"
            required
            className="h-15 rounded-[20px] border border-[#d9dde6] bg-white px-6 text-base text-[#131313] shadow-none placeholder:text-[#b0b6c4] focus-visible:border-[#8f87ff] focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-semibold text-[#636b78]">
            Senha
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Digite sua senha"
            autoComplete="current-password"
            required
            className="h-15 rounded-[20px] border border-[#d9dde6] bg-white px-6 text-base text-[#131313] shadow-none placeholder:text-[#b0b6c4] focus-visible:border-[#8f87ff] focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15"
          />
        </div>

        {state.error ? (
          <p className="rounded-[18px] border border-[#f0b1b8] bg-[#fff2f4] px-5 py-4 text-sm text-[#c43d4b]">
            {state.error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <div className="w-full max-w-[260px]">
            <SubmitButton />
          </div>
        </div>
      </form>

      <div className="mt-10 overflow-hidden rounded-[24px] border border-[#e7e7e7] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
        <div className="px-7 py-7 sm:px-9">
          <div className="mb-4 text-center text-[2.8rem] font-black leading-none text-[#7a64ff]">
            “
          </div>
          <p className="text-sm leading-7 text-[#99a1af] sm:text-base">
            Tenha em um só lugar a leitura do desempenho das campanhas, evolução
            dos resultados e o acompanhamento contínuo da operação.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-[#eee7ff] px-7 py-4 text-sm text-[#7d68f5] sm:px-9">
          <ShieldCheck className="size-4" />
          <p>Ambiente privado com acessos definidos pela equipe Tráfego Academy.</p>
        </div>
      </div>
    </div>
  );
}
