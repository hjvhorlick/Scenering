const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ImageResult {
  url: string;
  thumbnail: string;
  source: string;
  width: number;
  height: number;
}

// --- Pexels ---
async function searchPexels(query: string, count: number): Promise<ImageResult[]> {
  const apiKey = Deno.env.get("PEXELS_API_KEY");
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.photos) return [];

    return data.photos.map((p: any) => ({
      url: p.src.large,
      thumbnail: p.src.tiny,
      source: "pexels",
      width: p.width,
      height: p.height,
    }));
  } catch {
    return [];
  }
}

// --- Pixabay ---
async function searchPixabay(query: string, count: number): Promise<ImageResult[]> {
  const apiKey = Deno.env.get("PIXABAY_API_KEY");
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${count}&image_type=photo&orientation=horizontal&min_width=800`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.hits) return [];

    return data.hits.map((h: any) => ({
      url: h.largeImageURL,
      thumbnail: h.previewURL,
      source: "pixabay",
      width: h.imageWidth,
      height: h.imageHeight,
    }));
  } catch {
    return [];
  }
}

// --- Wikimedia Commons ---
async function searchWikimedia(query: string, count: number): Promise<ImageResult[]> {
  try {
    // Step 1: search for files
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=${count}&srsearch=${encodeURIComponent(query + " filetype:bitmap")}&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const searchResults = searchData?.query?.search;
    if (!searchResults || searchResults.length === 0) return [];

    // Step 2: get image URLs and thumbnails for each file
    const titles = searchResults.map((r: any) => r.title).join("|");
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1280&iiurlheight=720&titles=${encodeURIComponent(titles)}&origin=*`;
    const imageRes = await fetch(imageInfoUrl);
    if (!imageRes.ok) return [];
    const imageData = await imageRes.json();

    const pages = imageData?.query?.pages;
    if (!pages) return [];

    const results: ImageResult[] = [];
    for (const key of Object.keys(pages)) {
      const page = pages[key];
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      if (info.mime && !info.mime.startsWith("image/")) continue;
      if (info.mime === "image/svg+xml") continue;

      results.push({
        url: info.url || info.thumburl || "",
        thumbnail: info.thumburl || info.url || "",
        source: "wikimedia",
        width: info.width || 0,
        height: info.height || 0,
      });
    }

    return results.filter((r) => r.url && r.thumbnail);
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q") || "";
    const count = Math.min(parseInt(url.searchParams.get("count") || "10", 10), 30);

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing query parameter 'q'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try Pexels first
    let results = await searchPexels(query, count);

    // If Pexels returned nothing (no key or no results), try Pixabay
    if (results.length === 0) {
      results = await searchPixabay(query, count);
    }

    // If still nothing, use Wikimedia as last resort
    if (results.length === 0) {
      results = await searchWikimedia(query, count);
    }

    return new Response(
      JSON.stringify({ images: results, query, source: results[0]?.source || "none" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Image search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
