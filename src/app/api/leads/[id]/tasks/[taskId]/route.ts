import { NextResponse } from "next/server";
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
}
