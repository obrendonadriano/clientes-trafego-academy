function LoadingBar() {
  return (
    <div className="h-2 w-40 overflow-hidden rounded-full bg-border/60">
      <div className="h-full w-1/2 animate-[pulse_900ms_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  );
}

export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 lg:flex-row lg:px-6">
        <aside className="flex w-full flex-col rounded-[2rem] border border-border/60 bg-card/90 p-5 lg:w-[280px]">
          <div className="space-y-3">
            <div className="h-4 w-32 rounded-full bg-border/60" />
            <div className="h-8 w-40 rounded-full bg-border/60" />
          </div>
          <div className="mt-8 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 rounded-2xl bg-border/40" />
            ))}
          </div>
        </aside>

        <section className="flex-1 rounded-[2rem] border border-border/60 bg-card/75 p-5 lg:p-8">
          <div className="space-y-4 border-b border-border/60 pb-6">
            <div className="h-4 w-40 rounded-full bg-border/60" />
            <div className="h-12 w-72 rounded-full bg-border/60" />
            <div className="h-4 w-full max-w-2xl rounded-full bg-border/40" />
            <LoadingBar />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 rounded-[1.75rem] border border-border/60 bg-background/70" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
