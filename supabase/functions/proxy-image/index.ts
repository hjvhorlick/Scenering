// Deprecated security boundary. The authenticated application server now
// performs HTTPS host allowlisting, redirect validation, timeout and size caps.
Deno.serve(() => new Response(JSON.stringify({ error: "This endpoint has moved to the authenticated Scenering application API." }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
