import { NextRequest, NextResponse } from "next/server";
import { upsertIntegrationSetting } from "@/lib/integrations";
import {
  exchangeMetaCodeForToken,
  getMetaAdsConfig,
} from "@/lib/meta-ads";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/admin/configuracoes?meta=missing-code", request.url),
    );
  }

  const config = await getMetaAdsConfig();

  if (!config.appId || !config.appSecret) {
    return NextResponse.redirect(
      new URL("/admin/configuracoes?meta=missing-config", request.url),
    );
  }

  try {
    const token = await exchangeMetaCodeForToken({
      appId: config.appId,
      appSecret: config.appSecret,
      code,
    });

    await upsertIntegrationSetting("meta_ads", true, {
      app_id: config.appId,
      app_secret: config.appSecret,
      ad_account_id: config.adAccountId,
      access_token: token.access_token,
    });

    return NextResponse.redirect(
      new URL("/admin/configuracoes?meta=connected", request.url),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/admin/configuracoes?meta=error", request.url),
    );
  }
}
