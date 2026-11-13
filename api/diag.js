// Diagnostico temporario (branch de teste): mede o acesso ao Telegram desta regiao.
module.exports = async (req, res) => {
  const out = { node: process.version, region: process.env.VERCEL_REGION };
  const probe = async (name, url) => {
    const t = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      out[name] = { status: r.status, ms: Date.now() - t };
    } catch (e) {
      out[name] = { erro: String(e && (e.cause && e.cause.code || e.name || e.message)), ms: Date.now() - t };
    }
  };
  await Promise.all([
    probe("telegram_api", "https://api.telegram.org/"),
    probe("telegram_core", "https://core.telegram.org/"),
    probe("google", "https://www.google.com/generate_204"),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(out);
};
