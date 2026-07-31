import { NextResponse } from "next/server";
<<<<<<< HEAD
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const tasks = await prisma.task.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const json = await request.json();
    const { title, description, dueDate } = json;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        leadId: id,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
=======
import prisma from "@/lib/prisma";

export async function GET(
	req: Request,
	{ params }: { params: { id: string } }
) {
	try {
		const tasks = await prisma.task.findMany({
			where: { leadId: params.id },
			orderBy: { createdAt: "desc" },
		});
		return NextResponse.json(tasks);
	} catch (error: any) {
		console.error("GET Tasks Error:", error);
		return NextResponse.json(
			{ error: "Failed to fetch tasks" },
			{ status: 500 }
		);
	}
}

export async function POST(
	req: Request,
	{ params }: { params: { id: string } }
) {
	try {
		const { title, description, dueDate } = await req.json();

		if (!title) {
			return NextResponse.json(
				{ error: "Title is required" },
				{ status: 400 }
			);
		}

		const task = await prisma.task.create({
			data: {
				leadId: params.id,
				title,
				description: description || null,
				dueDate: dueDate ? new Date(dueDate) : null,
				status: "pending",
			},
		});

		return NextResponse.json(task, { status: 201 });
	} catch (error: any) {
		console.error("POST Task Error:", error);
		return NextResponse.json(
			{ error: "Failed to create task" },
			{ status: 500 }
		);
	}
>>>>>>> 9f14b31d5da5f0caa033fee5eb82ba347046dffc
}
