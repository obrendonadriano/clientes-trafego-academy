import { redirect } from "next/navigation";

export default async function LegacyClientAdsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const source = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(source)) {
    if (key !== "campanha" && key !== "conjunto" && typeof value === "string") {
      params.set(key, value);
    }
  }

  // Por último, para um `nivel` presente na URL não sobrescrever o desta rota.
  params.set("nivel", "ad");

  redirect(`/dashboard/campanhas?${params.toString()}`);
}
