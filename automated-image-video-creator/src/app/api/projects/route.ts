import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Split script into scenes and generate image search queries
function parseScript(script: string): { text: string; imageQuery: string }[] {
  // Split by double newlines, periods followed by newlines, or numbered lines
  const segments = script
    .split(/\n\n+|\n(?=\d+[\.\)]\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If there's only one segment, split by sentences
  let finalSegments = segments;
  if (segments.length <= 1 && script.length > 100) {
    const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
    // Group sentences into chunks of 2-3
    finalSegments = [];
    for (let i = 0; i < sentences.length; i += 2) {
      const chunk = sentences.slice(i, i + 2).join(" ").trim();
      if (chunk) finalSegments.push(chunk);
    }
  }

  // Limit to max 10 scenes
  const limited = finalSegments.slice(0, 10);

  return limited.map((text) => {
    // Extract key nouns/descriptors for image search
    const words = text
      .replace(/[^a-zA-Z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const query = words.slice(0, 5).join(" ");
    return { text, imageQuery: query || "abstract background" };
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, script } = body;

    if (!title || !script) {
      return NextResponse.json(
        { error: "Title and script are required" },
        { status: 400 }
      );
    }

    // Create project
    const [project] = await db
      .insert(projects)
      .values({ title, script })
      .returning();

    // Parse script into scenes
    const parsedScenes = parseScript(script);

    // Insert scenes
    const sceneValues = parsedScenes.map((scene, index) => ({
      projectId: project.id,
      orderIndex: index,
      text: scene.text,
      imageQuery: scene.imageQuery,
      duration: 4,
    }));

    const insertedScenes = await db
      .insert(scenes)
      .values(sceneValues)
      .returning();

    return NextResponse.json({ project, scenes: insertedScenes });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const allProjects = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));
    return NextResponse.json(allProjects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
