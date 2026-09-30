import Link from "next/link";

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
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="group">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-4">
              Tráfego Academy
            </p>
            <p className="mt-2 text-lg tracking-[-0.02em] font-semibold transition group-hover:text-primary">
              Portal privado
            </p>
          </Link>
        </div>

        <div className="mt-10 rounded-[18px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-4">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-[26px] tracking-[-0.03em] font-semibold tracking-[-0.035em] md:text-4xl">
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
