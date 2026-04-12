"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
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
    <div className="flex h-full min-h-0 flex-col">
      <div>
        <p className="text-[0.78rem] font-semibold text-[#a4a8b0] sm:text-base">
          Seja bem-vindo ao portal
        </p>
        <h2 className="mt-1 font-display text-[2rem] leading-[0.92] tracking-[-0.07em] text-[#090909] sm:mt-3 sm:max-w-[13ch] sm:text-[3.2rem]">
          <span className="block whitespace-nowrap">Faça login para acompanhar</span>
          <span className="block">suas campanhas</span>
        </h2>
        <p className="mt-2 max-w-2xl text-[0.84rem] leading-5 text-[#7f8794] sm:mt-4 sm:text-base sm:leading-7">
          Use o acesso liberado manualmente pela equipe da Tráfego Academy para
          entrar no seu dashboard de métricas.
        </p>
      </div>

      <form action={formAction} className="mt-3 space-y-3 sm:mt-8 sm:space-y-5">
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
            className="h-[50px] rounded-[18px] border border-[#cfd6e3] bg-[#fbfcff] px-4 text-[0.92rem] text-[#131313] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-[#b0b6c4] focus-visible:border-[#8f87ff] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15 sm:h-[62px] sm:rounded-[20px] sm:px-6 sm:text-base"
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
            className="h-[50px] rounded-[18px] border border-[#cfd6e3] bg-[#fbfcff] px-4 text-[0.92rem] text-[#131313] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-[#b0b6c4] focus-visible:border-[#8f87ff] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15 sm:h-[62px] sm:rounded-[20px] sm:px-6 sm:text-base"
          />
        </div>

        {state.error ? (
          <p className="rounded-[18px] border border-[#f0b1b8] bg-[#fff2f4] px-5 py-4 text-sm text-[#c43d4b]">
            {state.error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <div className="w-full max-w-full sm:max-w-[260px]">
            <SubmitButton />
          </div>
        </div>
      </form>
    </div>
  );
}
