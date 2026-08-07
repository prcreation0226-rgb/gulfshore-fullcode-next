import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateFAQ, pickRandomFAQTopic } from "@/lib/openai";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  // 1. Verify Secret
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return new NextResponse(
      JSON.stringify({ error: "Invalid or missing CRON secret" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Choose Topic
  const topic = pickRandomFAQTopic();

  // 3. Generate FAQ using OpenAI
  let faq;
  try {
    faq = await generateFAQ(topic);
  } catch (err: any) {
    console.error("[AI FAQ] generation error:", err);
    return new NextResponse(
      JSON.stringify({ error: "OpenAI FAQ generation failed", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Save to Database
  try {
    const created = await prisma.faq.create({
      data: {
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        isActive: false, // Save as Draft essentially
      },
    });

    return new NextResponse(
      JSON.stringify({
        message: "FAQ generated and saved",
        faqId: created.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (dbErr: any) {
    console.error("[AI FAQ] DB error:", dbErr);
    return new NextResponse(
      JSON.stringify({ error: "Database insert failed", details: dbErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
