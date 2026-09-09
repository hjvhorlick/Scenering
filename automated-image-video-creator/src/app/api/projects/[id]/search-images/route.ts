import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Resolve a picsum seed URL to its final direct image URL
async function resolvePicsumUrl(seed: string): Promise<string | null> {
  try {
    const picsumUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/1280/720`;
    // Use GET with redirect:manual to capture the redirect location
    const res = await fetch(picsumUrl, {
      redirect: "manual",
    });

    // Picsum returns a 302 redirect to the actual image
    const location = res.headers.get("location");
    if (location) {
      return location;
    }

    // If no redirect, check if we got the image directly
    if (res.ok) {
      return picsumUrl;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchImageUrls(query: string): Promise<string[]> {
  const urls: string[] = [];

  // Generate different seeds from the query
  const queryWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const seeds = [
    queryWords.join("-"),
    queryWords.join("_"),
    queryWords[0] || "nature",
    queryWords.slice(0, 2).join("-") + "-landscape",
    (queryWords[1] || queryWords[0] || "scenic") + "-photo",
    queryWords.join("-") + "-scene",
  ];

  // Resolve each seed to a direct URL
  const results = await Promise.allSettled(
    seeds.map((seed) => resolvePicsumUrl(seed))
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      urls.push(result.value);
    }
  }

  // If we couldn't resolve any, generate direct ID-based URLs
  if (urls.length === 0) {
    // Use predictable IDs based on query hash
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      hash = ((hash << 5) - hash + query.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < 6; i++) {
      const id = (Math.abs(hash + i * 137) % 1000) + 1;
      urls.push(`https://fastly.picsum.photos/id/${id}/1280/720.jpg`);
    }
  }

  return urls;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id, 10);
    const body = await request.json();
    const { sceneId, query } = body;

    // Get resolved image URLs
    const imageUrls = await fetchImageUrls(query);

    // Use proxy for the selected image (first one) to avoid CORS in canvas
    const selectedUrl = imageUrls[0];
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(selectedUrl)}`;

    // All options as proxied URLs
    const allProxied = imageUrls.map(
      (u) => `/api/proxy-image?url=${encodeURIComponent(u)}`
    );

    // Update the scene with the proxied image URL
    if (sceneId) {
      await db
        .update(scenes)
        .set({ imageUrl: proxyUrl, imageQuery: query })
        .where(eq(scenes.id, sceneId));
    }

    return NextResponse.json({
      imageUrl: proxyUrl,
      allImages: allProxied,
    });
  } catch (error) {
    console.error("Error searching images:", error);
    return NextResponse.json(
      { error: "Failed to search images" },
      { status: 500 }
    );
  }
}
