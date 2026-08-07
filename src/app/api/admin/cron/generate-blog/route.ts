import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBlogFromMemory, pickRandomTopic } from "@/lib/openai";

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
  const topic = pickRandomTopic();

  // 3. Generate Blog using OpenAI
  let blog;
  try {
    blog = await generateBlogFromMemory(topic);
  } catch (err: any) {
    console.error("[AI Blog] generation error:", err);
    return new NextResponse(
      JSON.stringify({ error: "OpenAI generation failed", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Save to Database as Draft
  try {
    const created = await prisma.blog.create({
      data: {
        title: blog.title,
        slug: blog.slug,
        description: blog.description,
        content: blog.content,
        coverImage: blog.coverImage || "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80", // default fallback
        category: blog.category,
        metaTitle: blog.metaTitle,
        metaDescription: blog.metaDescription,
        metaKeywords: blog.metaKeywords ? (blog.metaKeywords as any) : [],
        author: blog.author || "Gulfshore Group",
        published: false, // Save as Draft
        publishedAt: null,
      },
    });

    return new NextResponse(
      JSON.stringify({
        message: "Blog generated and saved as draft",
        blogId: created.id,
        slug: created.slug,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (dbErr: any) {
    console.error("[AI Blog] DB error:", dbErr);
    return new NextResponse(
      JSON.stringify({ error: "Database insert failed", details: dbErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
