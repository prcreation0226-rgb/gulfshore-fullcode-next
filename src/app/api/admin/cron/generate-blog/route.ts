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

  // 2. Choose 4 Topics
  const topics = Array.from({ length: 4 }, () => pickRandomTopic());

  // 3. Generate 4 Blogs in Parallel using OpenAI
  try {
    const blogPromises = topics.map(topic => generateBlogFromMemory(topic));
    const blogs = await Promise.all(blogPromises);

    // 4. Save to Database and Publish Instantly
    const createdBlogs = await Promise.all(
      blogs.map(blog =>
        prisma.blog.create({
          data: {
            title: blog.title,
            slug: blog.slug + "-" + Math.random().toString(36).substring(2, 7), // Ensure unique slug
            description: blog.description,
            content: blog.content,
            coverImage: blog.coverImage || "https://source.unsplash.com/1200x800/?luxury,home", 
            category: blog.category,
            metaTitle: blog.metaTitle,
            metaDescription: blog.metaDescription,
            metaKeywords: blog.metaKeywords ? (blog.metaKeywords as any) : [],
            author: blog.author || "Gulfshore Group",
            published: true, // Instantly publish
            publishedAt: new Date(),
          },
        })
      )
    );

    return new NextResponse(
      JSON.stringify({
        message: "4 Blogs generated and published successfully",
        count: createdBlogs.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[AI Blog Batch] error:", err);
    return new NextResponse(
      JSON.stringify({ error: "Batch generation failed", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
