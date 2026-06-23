import { NextResponse } from "next/server";
import { getWidgetConfig } from "@/lib/services-public";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const config = await getWidgetConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(config);
}
