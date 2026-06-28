/** Utility per condivisione e export PDF della strategia (web + mobile). */
import { Platform, Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import type { Strategy } from "@/api";

/** Testo brandizzato per la condivisione passaparola. */
export function strategyShareText(s: Strategy): string {
  const acc = s.ftmo?.account_size?.toLocaleString("it-IT") ?? "";
  return (
    `🎯 ${s.title}\n\n` +
    `${s.summary}\n\n` +
    `📊 GESTIONE RISCHIO\n` +
    `• Rischio/trade: ${s.risk_management.risk_per_trade_pct}%\n` +
    `• Max daily loss: $${s.ftmo?.max_daily_loss?.toLocaleString("it-IT")}\n` +
    `• Max overall loss: $${s.ftmo?.max_overall_loss?.toLocaleString("it-IT")}\n` +
    `• Target: $${s.ftmo?.profit_target?.toLocaleString("it-IT")}\n\n` +
    `✅ Conforme regole FTMO · Conto $${acc}\n` +
    `Generata con FTMO Strategy App 🚀`
  );
}

/** Condivide la strategia: Web Share API su web (fallback clipboard), Share.share su mobile. */
export async function shareStrategy(s: Strategy): Promise<void> {
  const text = strategyShareText(s);
  if (Platform.OS === "web") {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title: s.title, text });
        return;
      } catch {
        /* annullato dall'utente */
      }
    }
    await Clipboard.setStringAsync(text);
    if (typeof alert !== "undefined") alert("Strategia copiata negli appunti!");
    return;
  }
  await Share.share({ title: s.title, message: text });
}

function strategyHtml(s: Strategy): string {
  const li = (arr: string[]) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const routine = (s.daily_routine || [])
    .map((r) => `<tr><td><b>${r.time}</b></td><td>${escapeHtml(r.task)}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000;padding:28px;}
    h1{font-size:26px;border-bottom:3px solid #000;padding-bottom:8px;}
    h2{font-size:16px;text-transform:uppercase;letter-spacing:1px;margin-top:22px;border-left:6px solid #000;padding-left:8px;}
    .box{border:2px solid #000;padding:12px;margin-top:8px;}
    .mono{font-family:Menlo,monospace;background:#f4f4f2;padding:8px;white-space:pre-wrap;}
    table{width:100%;border-collapse:collapse;} td{border:1px solid #000;padding:6px;font-size:13px;}
    .grid{display:flex;gap:10px;} .grid .box{flex:1;}
    .red{color:#DC2626;} .green{color:#15803D;}
  </style></head><body>
  <h1>${escapeHtml(s.title)}</h1>
  <p>${escapeHtml(s.summary)}</p>
  <h2>Gestione del Rischio</h2>
  <div class="grid">
    <div class="box">Max Daily Loss<br/><b class="red">$${s.ftmo?.max_daily_loss?.toLocaleString("it-IT")}</b> (5%)</div>
    <div class="box">Max Overall Loss<br/><b class="red">$${s.ftmo?.max_overall_loss?.toLocaleString("it-IT")}</b> (10%)</div>
    <div class="box">Profit Target<br/><b class="green">$${s.ftmo?.profit_target?.toLocaleString("it-IT")}</b></div>
  </div>
  <div class="box mono">${escapeHtml(s.risk_management.lot_size_formula)}</div>
  <h2>Regole di Ingresso</h2><ol>${li(s.entry_rules)}</ol>
  <h2>Regole di Uscita</h2><ul>${li(s.exit_rules)}</ul>
  <h2>Routine Giornaliera</h2><table>${routine}</table>
  <h2>Cosa Fare</h2><ul>${li(s.do)}</ul>
  <h2>Cosa NON Fare</h2><ul>${li(s.dont)}</ul>
  </body></html>`;
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Export PDF: stampa nativa del browser su web, expo-print + Share su mobile. */
export async function exportStrategyPdf(s: Strategy): Promise<void> {
  const html = strategyHtml(s);
  if (Platform.OS === "web") {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    }
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: ".pdf" });
  }
}

// ---------------- Report PDF del backtest ----------------

export type BacktestMeta = {
  strategyLabel: string;
  timeframe: string;
  asset: string;
  rr: number;
  slAtrMult: number;
  costPct: number;
  sizing: string;
  source: string;
  accountSize: number;
  phase: string;
};

function backtestHtml(res: any, m: BacktestMeta): string {
  const c = (v: number) => (v >= 0 ? "green" : "red");
  const trades = (res.tradesList || [])
    .map(
      (t: any) =>
        `<tr><td>${t.dir === "long" ? "Long" : "Short"}</td><td>${t.entry}</td><td>${t.exit}</td>` +
        `<td class="${c(t.rMultiple)}">${t.rMultiple.toFixed(2)}R</td><td class="${c(t.pnl)}">${t.pnl.toFixed(0)}</td></tr>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000;padding:28px;}
    h1{font-size:24px;border-bottom:3px solid #000;padding-bottom:8px;}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;border-left:6px solid #000;padding-left:8px;}
    .grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;}
    .box{border:2px solid #000;padding:10px 14px;min-width:120px;}
    .box b{font-size:20px;display:block;}
    .verdict{padding:12px;border:2px solid #000;font-weight:800;margin-top:8px;background:${res.ftmoPassed ? "#DCFCE7" : "#FEE2E2"};}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;} td,th{border:1px solid #000;padding:5px;text-align:left;}
    .green{color:#15803D;} .red{color:#DC2626;} .muted{color:#666;font-size:12px;}
  </style></head><body>
  <h1>Report Backtest FTMO</h1>
  <p class="muted">${m.strategyLabel} · ${m.timeframe} · ${m.asset} · conto $${m.accountSize.toLocaleString("it-IT")} · fase ${m.phase}</p>
  <div class="verdict">${res.ftmoPassed ? "✓ CHALLENGE SUPERATA" : "✕ CHALLENGE NON SUPERATA"}</div>
  <h2>Parametri</h2>
  <p>Risk:Reward 1:${m.rr} · Stop ${m.slAtrMult}× ATR · Costi ${m.costPct}%/trade · Sizing ${m.sizing} · Dati: ${m.source}</p>
  <h2>Risultati</h2>
  <div class="grid">
    <div class="box">Rendimento<b class="${c(res.netPnlPct)}">${res.netPnlPct}%</b></div>
    <div class="box">Win rate<b>${res.winRate}%</b></div>
    <div class="box">Profit factor<b class="${c(res.profitFactor - 1)}">${res.profitFactor}</b></div>
    <div class="box">Max drawdown<b>${res.maxDrawdownPct}%</b></div>
    <div class="box">Avg R<b class="${c(res.avgR)}">${res.avgR}</b></div>
    <div class="box">Trade<b>${res.trades}</b></div>
  </div>
  <h2>Operazioni (${(res.tradesList || []).length})</h2>
  <table><tr><th>Dir</th><th>Entry</th><th>Exit</th><th>R</th><th>P&L $</th></tr>${trades || "<tr><td colspan=5>—</td></tr>"}</table>
  <p class="muted">Generato con FTMO Strategy App · I risultati passati non garantiscono quelli futuri.</p>
  </body></html>`;
}

export async function exportBacktestPdf(res: any, meta: BacktestMeta): Promise<void> {
  const html = backtestHtml(res, meta);
  if (Platform.OS === "web") {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    }
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: ".pdf" });
  }
}
