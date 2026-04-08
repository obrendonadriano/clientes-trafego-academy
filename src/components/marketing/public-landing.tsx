import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

type PublicLandingProps = {
  title?: string;
  subtitle?: string;
};

export function PublicLanding({
  title = "Um portal premium para apresentar campanhas, métricas e relatórios com IA.",
  subtitle = "Projeto isolado do site principal, pronto para rodar localmente agora e preparado para deploy futuro no subdomínio oficial.",
}: PublicLandingProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(25,150,122,0.2),_transparent_35%),linear-gradient(180deg,_#f5f7f2_0%,_#edf2ea_48%,_#dde7df_100%)] text-foreground dark:bg-[radial-gradient(circle_at_top,_rgba(75,255,205,0.14),_transparent_32%),linear-gradient(180deg,_#08111a_0%,_#09131f_50%,_#0d1724_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30 dark:opacity-10" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Tráfego Academy
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold">
              Portal privado de performance
            </h1>
          </div>
          <ThemeToggle />
        </div>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-8">
            <Badge>dashboard.trafegoacademy.online</Badge>
            <div className="space-y-5">
              <h2 className="max-w-3xl font-display text-5xl leading-tight font-semibold tracking-[-0.05em] sm:text-6xl">
                {title}
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                {subtitle}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
                <p className="text-sm text-muted-foreground">Acesso privado</p>
                <p className="mt-3 font-display text-2xl font-semibold">
                  Sem cadastro público
                </p>
              </div>
              <div className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
                <p className="text-sm text-muted-foreground">Controle total</p>
                <p className="mt-3 font-display text-2xl font-semibold">
                  Admin define tudo
                </p>
              </div>
              <div className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
                <p className="text-sm text-muted-foreground">Pronto para IA</p>
                <p className="mt-3 font-display text-2xl font-semibold">
                  Gemini conectável
                </p>
              </div>
            </div>
          </section>

          <LoginForm />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pb-4 text-sm text-muted-foreground">
          <Link href="/politica-de-privacidade" className="transition hover:text-primary">
            Política de Privacidade
          </Link>
          <Link href="/termos-de-servico" className="transition hover:text-primary">
            Termos de Serviço
          </Link>
          <Link href="/exclusao-de-dados" className="transition hover:text-primary">
            Exclusão de Dados
          </Link>
        </div>
      </div>
    </main>
  );
}
