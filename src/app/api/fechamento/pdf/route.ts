import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ClosingDocument } from "@/components/pdf/closing-document";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { getClosingData } from "@/lib/data/closing";
import { resolveClosingWindow } from "@/lib/data/closing-window";

// A geração do PDF é sob demanda e depende da sessão: nunca pode ser estática.
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function GET(request: NextRequest) {
  const user = await getOptionalCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const window = resolveClosingWindow(user.role, {
    inicio: params.get("inicio"),
    fim: params.get("fim"),
  });

  // Só o admin escolhe de qual cliente é o fechamento; o cliente sempre
  // recebe o próprio (getClosingData já filtra pelas permissões dele).
  const clientId = user.role === "admin" ? params.get("cliente") : null;

  try {
    const data = await getClosingData(user, window, clientId);
    const buffer = await renderToBuffer(ClosingDocument({ data }));
    const fileName = `fechamento-${slugify(data.clientName)}-${window.startDate}-a-${window.endDate}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha inesperada ao gerar o PDF do fechamento.",
      },
      { status: 500 },
    );
  }
}
