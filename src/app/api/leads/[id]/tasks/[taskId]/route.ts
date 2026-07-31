import { NextResponse } from "next/server";
<<<<<<< HEAD
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const { taskId } = params;
    const json = await request.json();
    const { title, description, dueDate, status } = json;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (status !== undefined) updateData.status = status;

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const { taskId } = params;
    await prisma.task.delete({
      where: { id: taskId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
=======
import prisma from "@/lib/prisma";

export async function PUT(
	req: Request,
	{ params }: { params: { id: string; taskId: string } }
) {
	try {
		const { status } = await req.json();

		const updatedTask = await prisma.task.update({
			where: { id: params.taskId },
			data: { status },
		});

		return NextResponse.json(updatedTask);
	} catch (error: any) {
		console.error("PUT Task Error:", error);
		return NextResponse.json(
			{ error: "Failed to update task" },
			{ status: 500 }
		);
	}
}

export async function DELETE(
	req: Request,
	{ params }: { params: { id: string; taskId: string } }
) {
	try {
		await prisma.task.delete({
			where: { id: params.taskId },
		});
		return NextResponse.json({ success: true });
	} catch (error: any) {
		console.error("DELETE Task Error:", error);
		return NextResponse.json(
			{ error: "Failed to delete task" },
			{ status: 500 }
		);
	}
>>>>>>> 9f14b31d5da5f0caa033fee5eb82ba347046dffc
}
