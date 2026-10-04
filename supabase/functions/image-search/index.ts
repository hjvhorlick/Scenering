// Deprecated security boundary. Image research now runs only through the
// authenticated Scenering application API, where provider use is rate-limited.
Deno.serve(() => new Response(JSON.stringify({ error: "This endpoint has moved to the authenticated Scenering application API." }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
