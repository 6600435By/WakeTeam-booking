import { NextRequest, NextResponse } from "next/server";
import { enforcePublicReadLimit } from "@/lib/public-api-guard";
import { getWidgetConfig } from "@/lib/services-public";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const limited = enforcePublicReadLimit(req);
  if (limited) return limited;

  try {
    const { slug } = await params;
    const config = await getWidgetConfig(slug);
    if (!config) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(config, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    console.error("widget-config error:", e);
    return NextResponse.json(
      { error: "Ошибка загрузки конфигурации виджета" },
      { status: 500 },
    );
  }
}
