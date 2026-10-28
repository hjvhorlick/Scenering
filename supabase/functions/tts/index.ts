// Deprecated server endpoint. Piper synthesis runs locally in the browser.
Deno.serve(() => new Response(JSON.stringify({ error: "Server-side narration is retired; use browser-local Piper." }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
