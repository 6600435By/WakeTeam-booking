import { NextResponse } from "next/server";
import { getWidgetConfig } from "@/lib/services-public";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
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
