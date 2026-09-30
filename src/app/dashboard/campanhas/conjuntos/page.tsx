import { redirect } from "next/navigation";

export default async function LegacyClientAdSetsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const source = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(source)) {
    if (key !== "campanha" && typeof value === "string") params.set(key, value);
  }

  // Por último, para um `nivel` presente na URL não sobrescrever o desta rota.
  params.set("nivel", "adset");

  redirect(`/dashboard/campanhas?${params.toString()}`);
}
