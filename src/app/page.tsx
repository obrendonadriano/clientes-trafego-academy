import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
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
              Dashboard privado de clientes
            </h1>
          </div>
          <ThemeToggle />
        </div>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-8">
            <Badge>dashboard.trafegoacademy.online</Badge>
            <div className="space-y-5">
              <h2 className="max-w-4xl font-display text-5xl leading-tight font-semibold tracking-[-0.05em] sm:text-6xl">
                Um portal privado para clientes acompanharem campanhas, métricas e relatórios com IA.
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Ambiente separado do site institucional, pensado para operação profissional,
                acesso controlado e deploy em produção no subdomínio oficial.
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
                <p className="text-sm text-muted-foreground">Operação centralizada</p>
                <p className="mt-3 font-display text-2xl font-semibold">
                  Admin controla tudo
                </p>
              </div>
              <div className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
                <p className="text-sm text-muted-foreground">Relatórios com IA</p>
                <p className="mt-3 font-display text-2xl font-semibold">
                  Gemini integrado
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.35)] backdrop-blur">
            <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
              Publicação
            </p>
            <h3 className="mt-3 font-display text-3xl font-semibold">
              URLs públicas prontas para Meta e Vercel
            </h3>
            <p className="mt-3 text-base leading-8 text-muted-foreground">
              Esta área pública já expõe as páginas institucionais mínimas necessárias para
              configurar o app, publicar com domínio válido e informar os links legais.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Entrar no portal
              </Link>
              <Link
                href="/politica-de-privacidade"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border/60 bg-background/70 px-5 text-sm font-medium transition hover:border-primary/30 hover:text-primary"
              >
                Política de Privacidade
              </Link>
              <Link
                href="/termos-de-servico"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border/60 bg-background/70 px-5 text-sm font-medium transition hover:border-primary/30 hover:text-primary"
              >
                Termos de Serviço
              </Link>
              <Link
                href="/exclusao-de-dados"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border/60 bg-background/70 px-5 text-sm font-medium transition hover:border-primary/30 hover:text-primary"
              >
                Exclusão de Dados
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
