import { NextRequest, NextResponse } from "next/server";

// Proxy external images through our server to avoid CORS issues
// This is essential for canvas-based video generation
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    // Follow redirects to get the final image
    const response = await fetch(url, {
      headers: {
        Accept: "image/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`Proxy fetch failed: ${response.status} for ${url}`);
      // Return a generated placeholder image
      return generatePlaceholder();
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Make sure it's actually an image
    if (!contentType.startsWith("image/")) {
      console.error(`Not an image content type: ${contentType} for ${url}`);
      return generatePlaceholder();
    }

    const buffer = await response.arrayBuffer();

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Proxy image error:", error);
    return generatePlaceholder();
  }
}

// Generate a simple SVG placeholder when image fetch fails
function generatePlaceholder(): NextResponse {
  const hue = Math.floor(Math.random() * 360);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${hue},50%,25%)"/>
        <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360},50%,15%)"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#g)"/>
    <text x="640" y="360" fill="rgba(255,255,255,0.3)" font-size="32" text-anchor="middle" font-family="sans-serif">Image</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache",
    },
  });
}
