import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function LegalPageShell({
  eyebrow,
  title,
  description,
  children,
}: LegalPageShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(25,150,122,0.2),_transparent_35%),linear-gradient(180deg,_#f5f7f2_0%,_#edf2ea_48%,_#dde7df_100%)] text-foreground dark:bg-[radial-gradient(circle_at_top,_rgba(75,255,205,0.14),_transparent_32%),linear-gradient(180deg,_#08111a_0%,_#09131f_50%,_#0d1724_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30 dark:opacity-10" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="group">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Tráfego Academy
            </p>
            <p className="mt-2 font-display text-2xl font-semibold transition group-hover:text-primary">
              Portal privado
            </p>
          </Link>
          <ThemeToggle />
        </div>

        <div className="mt-10 rounded-[2rem] border border-border/60 bg-card/80 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.35)] backdrop-blur md:p-10">
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
            {description}
          </p>

          <div className="mt-8 space-y-8 text-sm leading-7 text-muted-foreground">
            {children}
          </div>

          <div className="mt-10 flex flex-wrap gap-3 border-t border-border/60 pt-6 text-sm">
            <Link href="/politica-de-privacidade" className="text-primary transition hover:opacity-80">
              Política de Privacidade
            </Link>
            <Link href="/termos-de-servico" className="text-primary transition hover:opacity-80">
              Termos de Serviço
            </Link>
            <Link href="/exclusao-de-dados" className="text-primary transition hover:opacity-80">
              Exclusão de Dados
            </Link>
            <Link href="/login" className="text-primary transition hover:opacity-80">
              Acessar portal
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
