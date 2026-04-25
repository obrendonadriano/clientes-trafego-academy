"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { loginAction, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

export function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8" fill="none">
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5.5" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.4" cy="6.7" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8" fill="none">
      <rect x="3.5" y="5" width="17" height="14" rx="4.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M10 9.2 15.4 12 10 14.8V9.2Z" fill="currentColor" />
    </svg>
  );
}

export function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8" fill="none">
      <path
        d="M13.2 4.2v8.2a3.6 3.6 0 1 1-3-3.54"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 4.2c.7 1.88 2.2 3.16 4.6 3.42"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandBIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8" fill="none">
      <path
        d="M7 4.2h5.7c2.5 0 4 1.33 4 3.4 0 1.53-.8 2.6-2.18 3.04C16.42 11.03 18 12.3 18 14.7c0 2.9-2.17 4.1-5.35 4.1H7V4.2Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M9.1 6.5h3.05c1.53 0 2.35.63 2.35 1.75S13.68 10 12.15 10H9.1V6.5Z" fill="currentColor" />
      <path d="M9.1 12.2h3.45c1.8 0 2.75.72 2.75 2.02 0 1.35-.95 2.08-2.75 2.08H9.1V12.2Z" fill="currentColor" />
    </svg>
  );
}

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
            className="h-[50px] rounded-[18px] border border-[#e4e8f2] bg-white/95 px-4 text-base text-[#131313] shadow-[0_12px_28px_rgba(31,28,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] placeholder:text-[#9aa4b5] focus-visible:border-[#8f87ff] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15 dark:border-[#e4e8f2] dark:bg-white/95 dark:text-[#131313] dark:placeholder:text-[#9aa4b5] sm:h-[62px] sm:rounded-[20px] sm:px-6"
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
            className="h-[50px] rounded-[18px] border border-[#e4e8f2] bg-white/95 px-4 text-base text-[#131313] shadow-[0_12px_28px_rgba(31,28,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] placeholder:text-[#9aa4b5] focus-visible:border-[#8f87ff] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#8f87ff]/15 dark:border-[#e4e8f2] dark:bg-white/95 dark:text-[#131313] dark:placeholder:text-[#9aa4b5] sm:h-[62px] sm:rounded-[20px] sm:px-6"
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

      <div className="mt-3 overflow-hidden rounded-[22px] border border-[#e7e7e7] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.08)] sm:hidden">
        <div className="px-4 py-3">
          <div className="mb-1 text-center text-[1.25rem] font-black leading-none text-[#7a64ff]">
            &ldquo;
          </div>
          <p className="text-[0.76rem] leading-5 text-[#99a1af]">
            Tenha em um só lugar a leitura do desempenho das campanhas, evolução
            dos resultados e o acompanhamento contínuo da operação.
          </p>
        </div>
        <div className="flex items-center gap-2.5 bg-[#eee7ff] px-4 py-2 text-[0.72rem] leading-5 text-[#7d68f5]">
          <ShieldCheck className="size-4 shrink-0" />
          <p>Ambiente privado com acessos definidos pela equipe Tráfego Academy.</p>
        </div>
      </div>
    </div>
  );
}
