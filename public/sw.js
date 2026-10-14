// Service worker minimo: permite instalar o site como app. Tudo vem da rede
// (as ofertas mudam a cada minuto); sem internet, mostra um aviso simples.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<body style="background:#0b0d12;color:#eef0f3;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
          "<div><div style=\"font-size:48px\">📡</div><h2>Sem internet</h2><p>Conecte-se para ver as ofertas de agora.</p></div>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      )
    )
  );
});
