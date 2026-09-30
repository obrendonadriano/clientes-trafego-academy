import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, Megaphone } from "lucide-react";
import { IntentPrefetchLink } from "@/components/shell/intent-prefetch-link";
import { cn } from "@/lib/utils";

// Cartão branco padrão dos painéis do dashboard (título, subtítulo e ação).
export function Panel({
  title,
  subtitle,
  action,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-[18px] border border-border bg-card p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon}
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-foreground">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <IntentPrefetchLink
      href={href}
      className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[13px] font-medium text-text-2 transition hover:bg-surface-2"
    >
      {children}
      <ArrowRight className="size-[15px]" strokeWidth={1.75} />
    </IntentPrefetchLink>
  );
}

type FunnelStep = { label: string; value: number };

function formatInt(value: number) {
  return Math.round(value).toLocaleString("pt-BR");
}

function formatRatio(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: value < 10 ? 1 : 0,
    maximumFractionDigits: value < 10 ? 2 : 1,
  })}%`;
}

// Funil do período: largura em escala logarítmica suave (impressões são
// ordens de grandeza maiores que cliques) e a taxa de avanço entre etapas.
export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((step) => step.value), 1);
  const scale = (value: number) =>
    value <= 0 ? 0 : Math.max(4, (Math.log10(value + 1) / Math.log10(max + 1)) * 100);
  const shades = ["300", "400", "500", "600"];

  return (
    <div className="flex flex-col gap-1">
      {steps.map((step, index) => {
        const previous = index > 0 ? steps[index - 1].value : 0;
        const shade = shades[Math.min(index, shades.length - 1)];
        const next = shades[Math.min(index + 1, shades.length - 1)];

        return (
          <div key={step.label} className="flex flex-col gap-1">
            {index > 0 && previous > 0 ? (
              <div className="flex items-center gap-1.5 pl-[94px] text-[11.5px] text-muted-foreground sm:pl-[124px]">
                <ArrowDown className="size-3" strokeWidth={2} />
                {formatRatio((step.value / previous) * 100)} avançam
              </div>
            ) : null}
            <div className="grid grid-cols-[82px_minmax(0,1fr)_64px] items-center gap-3 sm:grid-cols-[112px_minmax(0,1fr)_72px]">
              <span className="text-[13px] font-medium text-text-3">{step.label}</span>
              <div className="h-[30px] overflow-hidden rounded-lg bg-[#f5f7fa]">
                <div
                  className="animate-ta-grow h-full origin-left rounded-lg"
                  style={{
                    width: `${scale(step.value)}%`,
                    background: `linear-gradient(90deg, var(--brand-${shade}), var(--brand-${next}))`,
                    animationDelay: `${index * 90}ms`,
                  }}
                />
              </div>
              <span className="text-right text-base font-semibold tabular-nums">
                {formatInt(step.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Cartão escuro "Pulso da operação": frases curtas com os números em destaque.
export function PulsePanel({
  title = "Pulso da operação",
  stamp,
  lines,
  footer,
}: {
  title?: string;
  stamp?: string;
  lines: { before?: string; strong: string; after?: string }[];
  footer?: ReactNode;
}) {
  return (
    <section className="relative flex w-full min-w-0 flex-col gap-[18px] overflow-hidden rounded-[18px] bg-sidebar p-6 text-sidebar-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_260px_at_100%_0%,rgba(124,92,250,0.36),transparent_65%)]" />
      <div className="relative flex items-center gap-2.5">
        <span className="animate-ta-pulse size-2 rounded-full bg-[#12b76a]" />
        <span className="text-base font-semibold text-white">{title}</span>
        {stamp ? (
          <span className="ml-auto text-xs text-sidebar-muted">{stamp}</span>
        ) : null}
      </div>
      <div className="relative flex flex-col gap-3 text-[15px] leading-normal">
        {lines.map((line, index) => (
          <div key={index} className="flex items-baseline gap-3">
            <span className="w-[18px] shrink-0 font-mono text-[11px] text-sidebar-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              {line.before}
              <b className="font-semibold text-white">{line.strong}</b>
              {line.after}
            </span>
          </div>
        ))}
      </div>
      {footer ? <div className="relative mt-auto flex flex-wrap gap-2">{footer}</div> : null}
    </section>
  );
}

export function PulseLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <IntentPrefetchLink
      href={href}
      className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-white/[0.14] bg-white/[0.06] px-3 text-[13px] font-medium text-white transition hover:bg-white/[0.12]"
    >
      {children}
    </IntentPrefetchLink>
  );
}

export type CampaignRankRow = {
  id: string;
  name: string;
  status: "Ativa" | "Pausada";
  spent: string;
  results: string;
  resultLabel?: string;
  cost: string;
  ctr: string;
  // 0–100: participação no investimento do período.
  share: number;
};

// Tabela das campanhas do período (desktop) e lista compacta (celular).
export function CampaignRankTable({ rows }: { rows: CampaignRankRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border-t border-border px-6 py-10 text-center text-sm text-muted-foreground">
        Nenhuma campanha com métricas no período selecionado.
      </div>
    );
  }

  const grid =
    "grid grid-cols-[minmax(220px,1.8fr)_100px_repeat(4,minmax(90px,1fr))_110px] gap-3";

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[860px]">
          <div
            className={cn(
              grid,
              "border-y border-border bg-surface-2 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
            )}
          >
            <span>Campanha</span>
            <span>Status</span>
            <span className="text-right">Investimento</span>
            <span className="text-right">Resultados</span>
            <span className="text-right">Custo/result.</span>
            <span className="text-right">CTR</span>
            <span>Participação</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className={cn(
                grid,
                "items-center border-b border-line-soft px-6 py-3 tabular-nums transition-colors last:border-b-0 hover:bg-[#faf9ff]",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-secondary text-text-3">
                  <Megaphone className="size-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  {row.resultLabel ? (
                    <p className="truncate text-xs text-text-4">{row.resultLabel}</p>
                  ) : null}
                </div>
              </div>
              <StatusPill status={row.status} />
              <span className="text-right">{row.spent}</span>
              <span className="text-right font-semibold">{row.results}</span>
              <span className="text-right">{row.cost}</span>
              <span className="text-right text-text-3">{row.ctr}</span>
              <div className="flex items-center gap-2">
                <span className="h-[5px] max-w-[60px] flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="block h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.max(2, row.share)}%` }}
                  />
                </span>
                <span className="w-9 text-right text-xs text-muted-foreground">
                  {Math.round(row.share)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col border-t border-border md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-2.5 border-b border-line-soft px-5 py-4 last:border-b-0">
            <div className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
              <StatusPill status={row.status} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <span>
                Invest. <b className="font-semibold text-foreground">{row.spent}</b>
              </span>
              <span>
                Result. <b className="font-semibold text-foreground">{row.results}</b>
              </span>
              <span>
                Custo <b className="font-semibold text-foreground">{row.cost}</b>
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function StatusPill({ status }: { status: "Ativa" | "Pausada" }) {
  const active = status === "Ativa";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 justify-self-start rounded-full px-[9px] py-[3px] text-xs font-semibold",
        active ? "bg-[#ecfdf3] text-[#067647]" : "bg-secondary text-text-3",
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", active ? "bg-[#12b76a]" : "bg-text-4")}
      />
      {status}
    </span>
  );
}
