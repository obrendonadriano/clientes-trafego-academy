import { NextResponse } from "next/server";
import { buildMetaConnectUrl, getMetaAdsConfig } from "@/lib/meta-ads";

export async function GET() {
  const config = await getMetaAdsConfig();

  if (!config.appId) {
    return NextResponse.redirect(
      new URL("/admin/configuracoes?meta=missing-app-id", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    );
  }

  return NextResponse.redirect(buildMetaConnectUrl(config.appId));
}
