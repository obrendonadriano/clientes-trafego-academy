import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  BrandBIcon,
  InstagramIcon,
  LoginForm,
  TikTokIcon,
  YoutubeIcon,
} from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

// Destino do CTA "Quero ser cliente" (capta novos clientes pelo Instagram).
// Troque por um link de WhatsApp/landing de vendas se preferir.
const BECOME_CLIENT_HREF = "https://www.instagram.com/otrafegoacademy";

type PublicLandingProps = {
  title?: string;
  subtitle?: string;
};

export function PublicLanding({
  title = "Acompanhe de perto a performance das suas campanhas.",
  subtitle = "Seu portal privado para acessar métricas, evolução dos resultados e relatórios da operação com uma experiência mais refinada e direta.",
}: PublicLandingProps) {
  const footerTone = "text-[0.8rem] leading-5 text-[#8f96a3]";

  const logoCloud = [
    "Meta Ads",
    "Google Ads",
    "Resultados reais",
    "Relatórios IA",
    "CPM",
    "CPL",
    "ROAS",
    "Conversões",
    "Criativos",
    "Funil",
    "Otimização",
    "Escala",
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-black max-lg:dark:bg-[#070611] max-lg:dark:text-white lg:bg-[#080507]">
      <div className="mx-auto flex min-h-screen max-w-[1920px] flex-col overflow-x-hidden lg:h-screen lg:max-h-screen lg:flex-row lg:overflow-hidden">
        <section className="relative hidden overflow-hidden bg-[#06060d] text-white lg:flex lg:h-screen lg:w-[44%] lg:flex-col lg:justify-between">
          <Image
            src="/brand/login-background.webp"
            alt=""
            aria-hidden="true"
            fill
            priority
            className="absolute inset-[-10px] h-[calc(100%+20px)] w-[calc(100%+20px)] max-w-none object-cover object-center"
            sizes="44vw"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.86),rgba(6,5,12,0.96)),radial-gradient(circle_at_74%_10%,rgba(112,74,255,0.18),transparent_22%),radial-gradient(circle_at_0%_100%,rgba(76,126,255,0.08),transparent_34%)]" />
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="absolute -right-24 top-[-2%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(112,74,255,0.24),transparent_62%)] blur-3xl" />
          <div className="absolute left-[-10rem] top-[12rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(76,126,255,0.08),transparent_68%)] blur-3xl" />

          <div className="relative z-10 px-12 pb-10 pt-12">
            <div className="mb-14 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/10 p-2 backdrop-blur-sm">
                <Image
                  src="/brand/logo.webp"
                  alt="Logo Tráfego Academy"
                  width={56}
                  height={56}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.36em] text-[#d3d6df]">
                Tráfego Academy
              </p>
            </div>

            <div className="max-w-[40rem]">
              <h1 className="max-w-[8ch] bg-[linear-gradient(135deg,#ffffff_0%,#ddd8ff_18%,#a78bfa_54%,#6888ff_100%)] bg-clip-text font-display text-[4.8rem] leading-[0.92] font-bold tracking-[-0.07em] text-transparent">
                Cliente no controle dos resultados
              </h1>
              <p className="mt-9 max-w-[28rem] text-[1rem] leading-9 text-white/88">
                {title}
              </p>
              <p className="mt-4 max-w-[30rem] text-[0.96rem] leading-8 text-white/64">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-4 gap-x-6 gap-y-9 px-12 pb-12 text-center text-[0.95rem] font-semibold text-white">
            {logoCloud.map((item) => (
              <div key={item} className="opacity-95">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="relative flex min-h-[100dvh] flex-1 flex-col overflow-x-hidden bg-white px-4 pb-1 pt-2 max-lg:dark:bg-[#070611] sm:px-8 sm:pb-6 lg:h-screen lg:rounded-l-[32px] lg:px-10 lg:pb-4 lg:pt-5">
          <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col">
            {/* Barra superior do MOBILE: logo + nome num canto, CTA no outro. */}
            <div className="flex items-center justify-between gap-2 rounded-[1.25rem] border border-black/5 bg-white/70 px-2.5 py-2 shadow-sm backdrop-blur max-lg:dark:border-white/10 max-lg:dark:bg-white/[0.04] lg:hidden">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#0c0a16] p-1.5">
                  <Image
                    src="/icon-192.png"
                    alt="Tráfego Academy"
                    width={40}
                    height={40}
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="truncate font-display text-sm font-semibold text-[#131313] max-lg:dark:text-white">
                  Tráfego Academy
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle compact />
                <div className="flex flex-col items-end leading-none">
                  <span className="hidden text-[0.62rem] text-[#8f96a3] min-[400px]:block">
                    Você ainda não é cliente?
                  </span>
                  <a
                    href={BECOME_CLIENT_HREF}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[linear-gradient(135deg,#4d7cff_0%,#815cff_100%)] px-3 py-1.5 text-[0.72rem] font-semibold text-white shadow-sm transition hover:brightness-105"
                  >
                    Quero ser cliente
                    <ArrowRight className="size-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Barra superior do DESKTOP (mantida): voltar + logo central. */}
            <div className="hidden items-center justify-between lg:flex">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#989898] sm:h-12 sm:w-12">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6 sm:h-7 sm:w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                >
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div className="rounded-md p-1">
                <Image
                  src="/brand/logo.webp"
                  alt="Logo Tráfego Academy"
                  width={48}
                  height={48}
                  className="h-10 w-10 rounded-md object-contain sm:h-12 sm:w-12"
                  priority
                />
              </div>

              <div className="h-10 w-10 sm:h-12 sm:w-12" />
            </div>

            <div className="mx-auto flex w-full max-w-[780px] flex-1 flex-col pt-1 sm:pt-8 lg:pt-6">
              <LoginForm />

              <div className="mt-3 pt-2 text-center sm:mt-8 sm:pt-4 lg:mt-auto lg:pt-6">
                <div className="space-y-2.5 sm:space-y-3">
                  <div className={`text-center ${footerTone} sm:hidden`}>
                    <p className={footerTone}>Redes Sociais</p>
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-[#8f96a3]">
                      <Link
                        href="https://www.instagram.com/otrafegoacademy"
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Instagram da Tráfego Academy"
                        className="inline-flex h-10 w-10 items-center justify-center text-[#8f96a3] transition hover:opacity-85"
                      >
                        <InstagramIcon />
                      </Link>
                      <button
                        type="button"
                        aria-label="YouTube"
                        className="inline-flex h-10 w-10 items-center justify-center text-[#8f96a3]"
                      >
                        <YoutubeIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="TikTok"
                        className="inline-flex h-10 w-10 items-center justify-center text-[#8f96a3]"
                      >
                        <TikTokIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="Rede B"
                        className="inline-flex h-10 w-10 items-center justify-center text-[#8f96a3]"
                      >
                        <BrandBIcon />
                      </button>
                    </div>
                  </div>
                  <p className={`mx-auto max-w-[44rem] ${footerTone} sm:text-[0.84rem] sm:leading-6 sm:text-[#8f96a3]`}>
                    Ao acessar o portal você concorda com nossa{" "}
                    <Link
                      href="/politica-de-privacidade"
                      className="text-[#8f96a3] underline underline-offset-2 transition hover:text-[#7d68f5]"
                    >
                      política de privacidade
                    </Link>{" "}
                    e com os{" "}
                    <Link
                      href="/termos-de-servico"
                      className="text-[#8f96a3] underline underline-offset-2 transition hover:text-[#7d68f5]"
                    >
                      termos de serviço
                    </Link>
                    .
                  </p>
                  <p className={`${footerTone} sm:text-[0.82rem]`}>
                    © Copyright 2024-2026 Tráfego Academy
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
