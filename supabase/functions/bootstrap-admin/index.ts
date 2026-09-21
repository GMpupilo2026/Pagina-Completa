// Deshabilitada: la cuenta de profesor ya fue creada.
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410 }));
