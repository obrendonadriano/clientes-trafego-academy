import Link from "next/link";
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";

type PublicLandingProps = {
  title?: string;
  subtitle?: string;
};

export function PublicLanding({
  title = "Acompanhe de perto a performance das suas campanhas.",
  subtitle = "Seu portal privado para acessar métricas, evolução dos resultados e relatórios da operação com uma experiência mais refinada e direta.",
}: PublicLandingProps) {
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
    <main className="min-h-screen bg-[#080507] text-black">
      <div className="mx-auto flex min-h-screen max-w-[1920px] flex-col lg:h-screen lg:max-h-screen lg:flex-row lg:overflow-hidden">
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

        <section className="relative flex min-h-[100dvh] flex-1 flex-col bg-white px-4 pb-4 pt-3 sm:px-8 lg:h-screen lg:rounded-l-[32px] lg:px-10 lg:pb-4 lg:pt-5">
          <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col">
            <div className="flex items-center justify-between">
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

            <div className="mx-auto flex w-full max-w-[780px] flex-1 flex-col pt-3 sm:pt-8 lg:pt-9">
              <LoginForm />

              <div className="mt-auto pt-4 text-center sm:pt-8">
                <p className="mx-auto max-w-[44rem] text-[0.72rem] leading-5 text-black sm:text-[0.84rem] sm:leading-6">
                  Ao acessar o portal você concorda com nossa{" "}
                  <Link
                    href="/politica-de-privacidade"
                    className="underline underline-offset-2 transition hover:text-[#7d68f5]"
                  >
                    política de privacidade
                  </Link>{" "}
                  e com os{" "}
                  <Link
                    href="/termos-de-servico"
                    className="underline underline-offset-2 transition hover:text-[#7d68f5]"
                  >
                    termos de serviço
                  </Link>
                  .
                </p>
                <p className="mt-2 text-[0.72rem] text-[#8f96a3] sm:mt-3 sm:text-[0.82rem]">
                  © Copyright 2024-2026 Tráfego Academy
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
