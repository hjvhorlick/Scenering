import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sceneId = parseInt(id, 10);
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.text !== undefined) updates.text = body.text;
    if (body.imageQuery !== undefined) updates.imageQuery = body.imageQuery;
    if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl;
    if (body.duration !== undefined) updates.duration = body.duration;

    const [updated] = await db
      .update(scenes)
      .set(updates)
      .where(eq(scenes.id, sceneId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating scene:", error);
    return NextResponse.json(
      { error: "Failed to update scene" },
      { status: 500 }
    );
  }
}
