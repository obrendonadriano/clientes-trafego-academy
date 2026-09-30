"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUpRight } from "lucide-react";
import { loginAction, type LoginState } from "@/app/login/actions";

const initialState: LoginState = {};

// Destino do CTA "Quero ser cliente" (site de captação da Tráfego Academy).
const BECOME_CLIENT_HREF = "https://site-trafego-academy.vercel.app/";

const FIELD =
  "h-[46px] w-full rounded-xl border border-input bg-white px-3.5 text-foreground outline-none transition-all duration-200 placeholder:text-text-4 focus:border-primary focus:shadow-[0_0_0_4px_var(--ring)] disabled:bg-surface-2";

// Desabilita os campos enquanto o login está em andamento, para que o clique
// em "Entrar" tenha feedback imediato e não aceite edições no meio.
function LoginFieldset({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <fieldset disabled={pending} className="flex flex-col gap-4">
      {children}
    </fieldset>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 items-center justify-center gap-2.5 rounded-xl bg-[linear-gradient(180deg,var(--brand-500),var(--brand-600))] text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.1),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-200 hover:shadow-[0_8px_20px_-8px_rgba(106,69,232,0.6)] hover:brightness-[1.07] disabled:cursor-wait"
    >
      {pending ? (
        <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
      ) : null}
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-7 py-12">
      <div className="flex flex-col gap-3.5">
        <h1 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.035em] text-balance text-foreground sm:text-[34px]">
          Acompanhe cada real investido virar resultado.
        </h1>
        <p className="text-[15.5px] leading-[1.55] text-pretty text-muted-foreground">
          Métricas das suas campanhas, evolução dos resultados e relatórios da
          operação em um só lugar.
        </p>
      </div>

      <form action={formAction}>
        <LoginFieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-2">Usuário</span>
            <input
              id="username"
              name="username"
              placeholder="Digite seu usuário"
              autoComplete="username"
              required
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-2">Senha</span>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
              className={FIELD}
            />
          </label>

          {state.error ? (
            <p
              role="alert"
              className="animate-ta-in rounded-xl border border-[#fecdca] bg-[#fef3f2] px-3.5 py-3 text-[13.5px] text-[#b42318]"
            >
              {state.error}
            </p>
          ) : null}

          <SubmitButton />

          <div className="flex items-center gap-3 text-[12.5px] text-text-4">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>

          <a
            href={BECOME_CLIENT_HREF}
            target="_blank"
            rel="noreferrer"
            className="flex h-[46px] items-center justify-center gap-2 rounded-xl border border-input bg-white font-medium text-text-2 transition hover:bg-surface-2"
          >
            Ainda não é cliente? Fale com a gente
            <ArrowUpRight className="size-4" strokeWidth={1.75} />
          </a>
        </LoginFieldset>
      </form>
    </div>
  );
}
