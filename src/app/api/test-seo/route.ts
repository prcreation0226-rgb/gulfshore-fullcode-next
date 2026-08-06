import { NextRequest, NextResponse } from "next/server";
import GetSeoData from "@/hooks/getSeoData";
import ExtractSearchParams from "@/hooks/extractSearchParams";

export async function GET(req: NextRequest) {
  try {
    const filtersParams = await ExtractSearchParams(["naples", "pelican-bay"]);
    const seoData = await GetSeoData({ params: filtersParams });
    return NextResponse.json({ success: true, seoData });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stack: error.stack });
  }
}
