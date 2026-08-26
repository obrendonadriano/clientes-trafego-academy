"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

type IntentPrefetchLinkProps = ComponentProps<typeof Link>;

// Evita que todos os destinos pesados do menu sejam carregados juntos assim
// que o dashboard abre. O Next só aquece a rota quando há intenção real do
// usuário (mouse ou teclado), preservando navegação rápida sem o pico inicial.
export function IntentPrefetchLink({
  prefetch,
  onFocus,
  onMouseEnter,
  ...props
}: IntentPrefetchLinkProps) {
  const [hasIntent, setHasIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={prefetch ?? (hasIntent ? null : false)}
      onFocus={(event) => {
        setHasIntent(true);
        onFocus?.(event);
      }}
      onMouseEnter={(event) => {
        setHasIntent(true);
        onMouseEnter?.(event);
      }}
    />
  );
}
