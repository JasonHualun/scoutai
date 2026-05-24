import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/admin-auth";
import { fetchTheStatsJson, theStatsConfigStatus } from "@/lib/thestats-api";

function summarizePayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return {
      type: "array",
      count: payload.length,
      firstItemKeys:
        payload[0] && typeof payload[0] === "object"
          ? Object.keys(payload[0] as Record<string, unknown>).slice(0, 12)
          : [],
    };
  }

  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    const nestedData = data.data;
    return {
      type: "object",
      keys: Object.keys(data).slice(0, 12),
      dataCount: Array.isArray(nestedData) ? nestedData.length : undefined,
    };
  }

  return { type: typeof payload };
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return unauthorized();

  const config = theStatsConfigStatus();
  if (!config.configured) {
    return NextResponse.json({
      ok: false,
      provider: "thestatsapi",
      configured: false,
      baseUrl: config.baseUrl,
      message: "还没有配置 THESTATS_API_KEY。",
    });
  }

  const path = req.nextUrl.searchParams.get("path") || "/football/matches";
  const limit = req.nextUrl.searchParams.get("limit") || "1";
  const startedAt = Date.now();

  try {
    const payload = await fetchTheStatsJson({
      path,
      query: { limit },
      revalidate: 0,
    });

    return NextResponse.json({
      ok: true,
      provider: "thestatsapi",
      configured: true,
      baseUrl: config.baseUrl,
      path,
      latencyMs: Date.now() - startedAt,
      sample: summarizePayload(payload),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: "thestatsapi",
        configured: true,
        baseUrl: config.baseUrl,
        path,
        error: error instanceof Error ? error.message : "TheStatsAPI 测试失败",
      },
      { status: 502 }
    );
  }
}
