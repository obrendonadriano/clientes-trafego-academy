import type { ReactNode } from "react";

type PageHeaderProps = {
  // "Área administrativa" / "Área do cliente" — sobrescreva quando fizer sentido.
  eyebrow?: string;
  title: string;
  description?: string;
  // Botões da direita (exportar, ação primária da seção).
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-2xl font-medium leading-tight text-foreground sm:text-[1.625rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
