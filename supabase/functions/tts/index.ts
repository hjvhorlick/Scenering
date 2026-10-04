// Deprecated security boundary.
// Scenering uses /api/tts on its cookie-authenticated application server.
// This function intentionally provides no synthesis path because Supabase JWTs
// cannot validate Scenering's separate HttpOnly platform session.
Deno.serve(() => new Response(JSON.stringify({ error: "This endpoint has moved to the authenticated Scenering application API." }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
