import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        const body = await req.json();
        
        const updateData: any = { ...body };
        
        // Handle cityId specifically to parse it or set to null
        if (body.cityId !== undefined) {
            updateData.cityId = body.cityId ? parseInt(body.cityId) : null;
        }

        // Parse order if provided
        if (body.order !== undefined) {
            updateData.order = parseInt(body.order);
        }

        const updatedFaq = await prisma.faq.update({
            where: { id },
            data: updateData
        });
        
        return NextResponse.json({ success: true, data: updatedFaq });
    } catch (error: any) {
        console.error(`Error in PUT /api/v2/faqs/${params.id}:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        
        await prisma.faq.delete({
            where: { id }
        });
        
        return NextResponse.json({ success: true, message: "FAQ deleted successfully" });
    } catch (error: any) {
        console.error(`Error in DELETE /api/v2/faqs/${params.id}:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
