import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const prop = await prisma.property.findFirst({
        where: { MLSNumber: '226021652' }
    });
    return NextResponse.json({ success: true, raw: prop?.raw });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stack: error.stack });
  }
}
