import { NextRequest, NextResponse } from "next/server";

// Generate multiple image URLs for a query using picsum
async function fetchImageOptions(query: string): Promise<string[]> {
  const images: string[] = [];
  const seeds = [
    query.replace(/\s+/g, "-"),
    query.replace(/\s+/g, "_"),
    query.split(" ")[0] || "nature",
    `${query.replace(/\s+/g, "-")}-hd`,
    `${query.split(" ").pop() || "landscape"}-view`,
    `scene-${query.replace(/\s+/g, "-")}`,
  ];

  for (const seed of seeds) {
    const picsumUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/1280/720`;
    images.push(`/api/proxy-image?url=${encodeURIComponent(picsumUrl)}`);
  }

  return images;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "nature";

  const images = await fetchImageOptions(query);

  return NextResponse.json({ images, query });
}
