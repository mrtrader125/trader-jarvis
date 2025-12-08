// src/lib/jarvis/math.ts

export type EvalContext = {
  accountSize?: number;
  targetPercent?: number;
  targetMoney?: number;
  currentProfit?: number;
};

function cleanNumber(str: string): number | undefined {
  const cleaned = str.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function isPercentOfTargetQuestion(text: string | undefined | null): boolean {
  if (!text) return false;
  const q = text.toLowerCase();
  return (
    q.includes("percent of the target") ||
    (q.includes("percent") && q.includes("target")) ||
    (q.includes("%") && q.includes("target")) ||
    q.includes("how much percent") ||
    q.includes("how many percent")
  );
}

export function extractEvalContext(text: string): EvalContext | null {
  const ctx: EvalContext = {};
  const lower = text.toLowerCase();

  // Account size: "15000$ account", "15k account", etc.
  let m =
    lower.match(/(\d[\d,\.]*)\s*(?:\$|usd)?[^\n]{0,25}\b(account|challenge|funded)/i) ||
    lower.match(/\b(account|challenge|funded)[^\n]{0,25}(\d[\d,\.]*)\s*(?:\$|usd)?/i);
  if (m) {
    const num = cleanNumber(m[1] || m[2]);
    if (num) ctx.accountSize = num;
  }

  // Target percent: "target is 12%" / "12% target"
  m =
    lower.match(/target[^\n]{0,25}(\d+(?:\.\d+)?)\s*%/) ||
    lower.match(/(\d+(?:\.\d+)?)\s*%[^\n]{0,25}target/);
  if (m) {
    const num = cleanNumber(m[1]);
    if (num) ctx.targetPercent = num;
  }

  // Target money: "target ... 1800$" / "1800$ target"
  m =
    lower.match(/target[^\n]{0,25}(\d[\d,\.]*)\s*(?:\$|usd)/i) ||
    lower.match(/(\d[\d,\.]*)\s*(?:\$|usd)[^\n]{0,25}target/i);
  if (m) {
    const num = cleanNumber(m[1]);
    if (num) ctx.targetMoney = num;
  }

  // Current profit: "1200$ profit" / "profit 1200$"
  m =
    lower.match(/(\d[\d,\.]*)\s*(?:\$|usd)?[^\n]{0,25}\bprofit/i) ||
    lower.match(/\bprofit[^\n]{0,25}(\d[\d,\.]*)\s*(?:\$|usd)?/i);
  if (m) {
    const num = cleanNumber(m[1]);
    if (num) ctx.currentProfit = num;
  }

  if (
    ctx.accountSize === undefined &&
    ctx.targetPercent === undefined &&
    ctx.targetMoney === undefined &&
    ctx.currentProfit === undefined
  ) {
    return null;
  }

  // Derive targetMoney from accountSize * targetPercent if possible
  if (!ctx.targetMoney && ctx.targetPercent && ctx.accountSize) {
    ctx.targetMoney = (ctx.accountSize * ctx.targetPercent) / 100;
  }

  return ctx;
}

export function formatEvalAnswer(ctx: EvalContext): string | null {
  const { accountSize, targetPercent, targetMoney, currentProfit } = ctx;

  if (!targetMoney || !currentProfit) return null;

  const pctDone = (currentProfit / targetMoney) * 100;
  const remaining = targetMoney - currentProfit;
  const pctDoneRounded = Math.round(pctDone * 10) / 10;
  const remainingRounded = Math.round(remaining * 100) / 100;

  let accountPctStr = "";
  if (accountSize) {
    const pctAcc = (currentProfit / accountSize) * 100;
    const pctAccRounded = Math.round(pctAcc * 10) / 10;
    accountPctStr = ` That's also about ${pctAccRounded}% on the ${accountSize.toLocaleString()}$ account.`;
  }

  const targetLine = targetPercent
    ? `Target: ${targetPercent}% = ${targetMoney.toLocaleString()}$.`
    : `Target: ${targetMoney.toLocaleString()}$.`;

  return (
    `From what you told me:\n` +
    `Account: ${accountSize ? accountSize.toLocaleString() + "$" : "N/A"}, ${targetLine}\n` +
    `Current profit: ${currentProfit.toLocaleString()}$.\n\n` +
    `You've completed about ${pctDoneRounded}% of the target and need roughly ${remainingRounded.toLocaleString()}$ more to finish.${accountPctStr}\n\n` +
    `Nice controlled progress, Bro — no need to force random trades just to chase the last bit.`
  );
}

/**
 * Convenience helper: given raw text, try to parse and fully answer a
 * "how much percent of target" question. Returns null if it can't.
 */
export function buildPercentOfTargetAnswerFromText(text: string): string | null {
  const ctx = extractEvalContext(text);
  if (!ctx) return null;
  return formatEvalAnswer(ctx);
}
