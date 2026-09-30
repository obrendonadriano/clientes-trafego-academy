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
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-4">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[28px]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-[15px] leading-6 text-muted-foreground">
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
