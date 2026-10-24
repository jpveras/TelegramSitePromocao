// Resumo diario no Telegram.
//   Cron da Vercel (todo dia ~23h de Brasilia): GET /api/report
//   Painel (com SETUP_KEY):
//     /api/report?key=...&action=status         -> chat atual e quem mandou /start ao bot
//     /api/report?key=...&action=set&chat=ID    -> escolhe quem recebe (chat vazio desativa)
//     /api/report?key=...&action=send           -> envia agora (teste)
//     /api/report?key=...&action=preview        -> texto do resumo, sem enviar
//   Relatorio semanal: cron de domingo 8h de Brasilia -> GET /api/report?weekly=1
//     /api/report?key=...&action=weekly-preview | weekly-send

const { isConfigured, redis } = require("./_lib/store");
const { buildReport, sendReport, reportChat, listCandidates } = require("./_lib/report");
const { buildWeekly, sendWeekly } = require("./_lib/weekly");

function isCron(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (secret) return auth === `Bearer ${secret}`;
  return /vercel-cron/i.test(req.headers["user-agent"] || "");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!isConfigured()) {
    res.status(200).json({ ok: false, error: "Banco não configurado." });
    return;
  }
  const q = req.query || {};
  const hasKey = process.env.SETUP_KEY && q.key === process.env.SETUP_KEY;

  try {
    if (!hasKey) {
      if (!isCron(req)) {
        res.status(401).json({ error: "Não autorizado." });
        return;
      }
      // Semanal: pedido pelo cron de domingo (?weekly=1) ou, por garantia, qualquer chamada do cron domingo de manha.
      const sp = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date());
      const wd = sp.find((x) => x.type === "weekday").value, hr = Number(sp.find((x) => x.type === "hour").value);
      const weekly = !!q.weekly || (wd === "Sun" && hr >= 6 && hr < 12);
      res.status(200).json({ ok: true, ...(weekly ? await sendWeekly() : await sendReport()) });
      return;
    }

    const action = String(q.action || "status");
    if (action === "status") {
      res.status(200).json({ ok: true, chat: await reportChat(), candidates: await listCandidates() });
    } else if (action === "set") {
      const chat = String(q.chat || "");
      if (!chat) {
        await redis([["DEL", "report:chat"]]);
        res.status(200).json({ ok: true, chat: null });
        return;
      }
      const known = (await listCandidates()).some((c) => c.id === chat);
      if (!known) {
        res.status(400).json({ ok: false, error: "Esse chat ainda não mandou /start para o bot." });
        return;
      }
      await redis([["SET", "report:chat", chat]]);
      res.status(200).json({ ok: true, chat });
    } else if (action === "send") {
      res.status(200).json({ ok: true, ...(await sendReport({ force: true })) });
    } else if (action === "weekly-preview") {
      res.status(200).json({ ok: true, text: await buildWeekly() });
    } else if (action === "weekly-send") {
      res.status(200).json({ ok: true, ...(await sendWeekly({ force: true })) });
    } else if (action === "preview") {
      res.status(200).json({ ok: true, text: await buildReport() });
    } else {
      res.status(400).json({ ok: false, error: "Ação desconhecida." });
    }
  } catch (err) {
    console.error("[report] Falha:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
};
