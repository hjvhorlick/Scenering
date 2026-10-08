// Deprecated endpoint. Speechify synthesis now runs directly from the user's
// browser to Speechify so the customer key never passes through Scenering.
Deno.serve(() => new Response(JSON.stringify({ error: "Speechify requests are made directly from your browser; this endpoint is retired." }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
