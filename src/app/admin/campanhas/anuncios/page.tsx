import { redirect } from "next/navigation";

export default async function LegacyAdsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const source = await searchParams;
  const params = new URLSearchParams({ nivel: "ad" });

  for (const [key, value] of Object.entries(source)) {
    if (key !== "campanha" && key !== "conjunto" && typeof value === "string") {
      params.set(key, value);
    }
  }

  redirect(`/admin/campanhas?${params.toString()}`);
}
