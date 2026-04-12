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
        <p className="text-[0.8rem] font-semibold text-[#a4a8b0] sm:text-base">
          Seja bem-vindo ao portal
        </p>
        <h2 className="mt-2 max-w-[13ch] font-display text-[1.9rem] leading-[0.96] tracking-[-0.06em] text-[#090909] sm:mt-3 sm:text-[3.2rem]">
          Faça login para acompanhar suas campanhas
        </h2>
        <p className="mt-3 max-w-2xl text-[0.9rem] leading-6 text-[#7f8794] sm:mt-4 sm:text-base sm:leading-7">
          Use o acesso liberado manualmente pela equipe da Tráfego Academy para
          entrar no seu dashboard de métricas.
        </p>
      </div>

      <form action={formAction} className="mt-5 space-y-4 sm:mt-8 sm:space-y-5">
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
            className="h-14 rounded-[18px] border border-[#cfd6e3] bg-[#fbfcff] px-5 text-[0.95rem] text-[#131313] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-[#b0b6c4] focus-visible:border-[#8f87ff] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15 sm:h-[62px] sm:rounded-[20px] sm:px-6 sm:text-base"
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
            className="h-14 rounded-[18px] border border-[#cfd6e3] bg-[#fbfcff] px-5 text-[0.95rem] text-[#131313] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-[#b0b6c4] focus-visible:border-[#8f87ff] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15 sm:h-[62px] sm:rounded-[20px] sm:px-6 sm:text-base"
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

      <div className="mt-5 overflow-hidden rounded-[22px] border border-[#e7e7e7] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.08)] sm:mt-10 sm:rounded-[24px]">
        <div className="px-5 py-5 sm:px-9 sm:py-7">
          <div className="mb-2 text-center text-[2rem] font-black leading-none text-[#7a64ff] sm:mb-4 sm:text-[2.8rem]">
            “
          </div>
          <p className="text-[0.84rem] leading-5 text-[#99a1af] sm:text-base sm:leading-7">
            Tenha em um só lugar a leitura do desempenho das campanhas, evolução
            dos resultados e o acompanhamento contínuo da operação.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-[#eee7ff] px-5 py-3 text-[0.8rem] text-[#7d68f5] sm:px-9 sm:py-4 sm:text-sm">
          <ShieldCheck className="size-4 shrink-0" />
          <p>Ambiente privado com acessos definidos pela equipe Tráfego Academy.</p>
        </div>
      </div>
    </div>
  );
}
