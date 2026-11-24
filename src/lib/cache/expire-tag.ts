import "server-only";

import { revalidateTag, updateTag } from "next/cache";
import { getMobileAccessToken } from "@/lib/auth/mobile-context";

// Expira uma tag de cache na hora, valendo tanto no site quanto no app.
//
// `updateTag` só pode ser chamado dentro de Server Action. O app reaproveita
// as mesmas actions pela rota /api/mobile (um Route Handler), onde ele lança
// erro — e a ação inteira falhava depois de já ter gravado. Lá usamos
// `revalidateTag` com expiração imediata, que tem o mesmo efeito prático.
export function expireTag(tag: string) {
  if (getMobileAccessToken()) {
    revalidateTag(tag, { expire: 0 });
    return;
  }

  updateTag(tag);
}
