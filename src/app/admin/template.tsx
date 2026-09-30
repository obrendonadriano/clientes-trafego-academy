// Recria o conteúdo a cada navegação para tocar a entrada suave da página.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-ta-page">{children}</div>;
}
