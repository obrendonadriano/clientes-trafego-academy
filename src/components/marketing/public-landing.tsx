import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Megaphone, TrendingUp } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

// Alturas das barras do mini-dashboard ilustrativo (últimas mais fortes).
const MOCK_BARS = [34, 42, 38, 51, 46, 58, 49, 63, 57, 69, 64, 78, 72, 88];

const MOCK_ROWS = [
  { initials: "LC", name: "Lançamento", type: "Leads", tag: "CPL R$ 8,42", tone: "good" },
  { initials: "RM", name: "Remarketing 30d", type: "Conversões", tag: "ROAS 4,1x", tone: "good" },
  { initials: "WA", name: "Captação WhatsApp", type: "Mensagens", tag: "R$ 3,10", tone: "neutral" },
] as const;

function MockDashboard() {
  return (
    <div className="animate-ta-rise absolute bottom-[-8%] left-[14%] right-[-12%] top-[18%] flex flex-col gap-4 rounded-[18px] bg-background p-[22px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] [animation-duration:1s]">
      <div className="flex items-center gap-2.5">
        <span className="text-[15px] font-semibold text-foreground">Dashboard</span>
        <span className="ml-auto flex gap-1.5 whitespace-nowrap">
          <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
            7 dias
          </span>
          <span className="rounded-lg bg-foreground px-2.5 py-1 text-[11px] text-white">
            30 dias
          </span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["INVESTIMENTO", "R$ 12,4 mil", "+9,2%"],
          ["RESULTADOS", "1.482", "+16,8%"],
          ["CUSTO/RESULT.", "R$ 8,42", "-12,5%"],
        ].map(([label, value, delta]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3.5">
            <p className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-1.5 whitespace-nowrap text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {value}
            </p>
            <p className="mt-1 text-[11px] text-[#067647]">{delta}</p>
          </div>
        ))}
      </div>

      <div className="flex h-[150px] items-end gap-2 rounded-xl border border-border bg-card p-4">
        {MOCK_BARS.map((height, index) => (
          <div
            key={index}
            className="animate-ta-grow-y flex-1 origin-bottom rounded-[5px_5px_2px_2px]"
            style={{
              height: `${height}%`,
              background:
                index >= MOCK_BARS.length - 3
                  ? "linear-gradient(180deg,var(--brand-500),var(--brand-600))"
                  : "var(--brand-100)",
              animationDelay: `${300 + index * 40}ms`,
            }}
          />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card px-3.5 py-1.5">
        {MOCK_ROWS.map((row) => (
          <div
            key={row.name}
            className="flex items-center gap-2.5 border-b border-line-soft py-2.5 last:border-b-0"
          >
            <span className="grid size-7 place-items-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
              {row.initials}
            </span>
            <span className="text-[13px] font-medium text-foreground">{row.name}</span>
            <span className="text-xs text-muted-foreground">{row.type}</span>
            <span
              className={
                row.tone === "good"
                  ? "ml-auto rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[11px] font-semibold text-[#067647]"
                  : "ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-text-3"
              }
            >
              {row.tag}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FLOAT_CARD =
  "animate-ta-rise absolute flex items-center gap-3 rounded-[14px] bg-white/[0.96] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-[8px]";

function ShowcasePanel() {
  return (
    <div
      aria-hidden="true"
      className="relative m-3 hidden min-w-0 flex-[1_1_55%] overflow-hidden rounded-3xl bg-sidebar lg:block"
    >
      <div className="absolute inset-0 bg-[radial-gradient(700px_420px_at_75%_20%,rgba(124,92,250,0.38),transparent_60%),radial-gradient(500px_400px_at_10%_100%,rgba(154,130,255,0.18),transparent_60%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <MockDashboard />

      <div className={`${FLOAT_CARD} left-[6%] top-[12%] px-4 py-3`} style={{ animationDelay: "300ms" }}>
        <span className="grid size-[34px] place-items-center rounded-[10px] bg-brand-50 text-brand-600">
          <Megaphone className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            +214 novos leads
          </p>
          <p className="text-xs text-muted-foreground">hoje, até agora</p>
        </div>
      </div>

      <div className={`${FLOAT_CARD} right-[7%] top-[9%] gap-3.5 px-4 py-3.5`} style={{ animationDelay: "500ms" }}>
        <div className="relative size-[46px]">
          <svg width="46" height="46" viewBox="0 0 46 46">
            <circle cx="23" cy="23" r="19" fill="none" stroke="#ede8ff" strokeWidth="5" />
            <circle
              cx="23"
              cy="23"
              r="19"
              fill="none"
              stroke="#7c5cfa"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="98 120"
              transform="rotate(-90 23 23)"
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-[13px] font-bold text-foreground">
            4,1x
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">ROAS do mês</p>
          <p className="text-xs text-muted-foreground">Remarketing · acima da meta</p>
        </div>
      </div>

      <div className={`${FLOAT_CARD} bottom-[26%] left-[4%] px-4 py-3`} style={{ animationDelay: "700ms" }}>
        <span className="grid size-[34px] place-items-center rounded-[10px] bg-[#ecfdf3] text-[#067647]">
          <MessageCircle className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Novo lead no WhatsApp</p>
          <p className="text-xs text-muted-foreground">Campanha Lançamento · agora</p>
        </div>
      </div>

      <div
        className="animate-ta-rise absolute bottom-[10%] right-[6%] rounded-[14px] border border-white/[0.12] bg-[#111827] px-[18px] py-3.5 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)]"
        style={{ animationDelay: "900ms" }}
      >
        <p className="text-[11px] font-semibold tracking-[0.06em] text-text-4">CTR MÉDIO</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-[-0.03em] text-white">+18,4%</span>
          <TrendingUp className="size-[18px] text-[#32d583]" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

// Logo quadrada de fundo preto num quadradinho arredondado + nome ao lado.
function BrandTile({ size, className }: { size: number; className?: string }) {
  return (
    <Image
      src="/brand/logo-tile.webp"
      alt=""
      width={size}
      height={size}
      priority
      className={`shrink-0 rounded-[12px] ring-1 ring-white/10 ${className ?? ""}`}
    />
  );
}

export function PublicLanding() {
  return (
    <main className="min-h-app flex bg-background">
      <section className="min-h-app flex min-w-0 max-w-full flex-[1_0_45%] flex-col lg:px-14 lg:py-10">
        {/* Marca: quadradinho da logo + nome, sobre o fundo da página. */}
        <div className="flex items-center gap-3 px-5 pt-5 sm:px-14 lg:px-0 lg:pt-0">
          <BrandTile size={48} className="size-11 lg:size-12" />
          <span className="text-[19px] font-bold tracking-[-0.02em] text-foreground lg:text-[21px]">
            Tráfego Academy
          </span>
        </div>

        <div className="flex flex-1 items-center px-5 sm:px-14 lg:px-0">
          <LoginForm />
        </div>

        <div className="flex flex-col gap-0.5 px-5 pb-4 text-[11.5px] leading-snug text-text-4 sm:px-14 lg:px-0 lg:pb-0 lg:text-[12.5px]">
          <p>
            Ao acessar você concorda com a{" "}
            <Link href="/politica-de-privacidade" className="underline underline-offset-2 transition hover:text-brand-600">
              política de privacidade
            </Link>{" "}
            e os{" "}
            <Link href="/termos-de-servico" className="underline underline-offset-2 transition hover:text-brand-600">
              termos de serviço
            </Link>
            .
          </p>
          <p>© 2024-2026 Tráfego Academy</p>
        </div>
      </section>

      <ShowcasePanel />
    </main>
  );
}
