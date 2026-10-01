import Image from "next/image";
import { cn } from "@/lib/utils";

// Marca da Tráfego Academy: logo de fundo preto num quadradinho arredondado.
// Usada no login e na sidebar (com o nome ao lado).
export function BrandTile({
  size,
  className,
  priority,
}: {
  size: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/logo-tile.webp"
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 rounded-[12px] ring-1 ring-white/10", className)}
    />
  );
}
