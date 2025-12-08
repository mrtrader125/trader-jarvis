// src/lib/jarvis/math.ts

// ---------- Types ----------

export type Currency = string;

export interface PositionSizeInput {
  accountSize: number;      // e.g. 100000
  riskPercent: number;      // e.g. 1 (for 1% risk)
  stopLossPoints: number;   // pips / points
  valuePerPoint: number;    // money per pip/point per 1 lot or unit
}

export interface PositionSizeResult {
  riskAmount: number;
  positionSize: number;
  riskPercent: number;
  stopLossPoints: number;
  valuePerPoint: number;
}

export interface PropFirmConfig {
  accountSize: number;
  currency: Currency;
  targetReturnPct: number;       // e.g. 8
  maxDailyDrawdownPct: number;   // e.g. 5
  maxTotalDrawdownPct: number;   // e.g. 10
  minTradingDays?: number;
  phase?: 1 | 2 | 3;
}

export interface PropFirmPlanInput {
  config: PropFirmConfig;
  riskPerTradePct: number;
  expectedRR: number;
  expectedWinratePct: number;
  maxTradesPerDay: number;
}

export interface PropFirmPlanResult {
  dailyLossLimitPct: number;
  dailyLossLimitAmount: number;
  totalLossLimitPct: number;
  totalLossLimitAmount: number;
  targetProfitPct: number;
  targetProfitAmount: number;

  maxRiskPerTradePctByDailyRule: number;
  maxRiskPerTradePctByTotalRule: number;
  safeRiskPerTradePct: number;

  estimatedLosingStreak: number;
  notes: string[];
}

export interface CompoundingPlanInput {
  startingBalance: number;
  riskPerTradePct: number;
  expectedRR: number;
  expectedWinratePct: number;
  numberOfTrades: number;
}

export interface CompoundingStep {
  tradeNumber: number;
  balance: number;
}

export interface CompoundingPlanResult {
  startingBalance: number;
  endingBalance: number;
  growthFactorPerTrade: number;
  numberOfTrades: number;
  steps: CompoundingStep[];
}

// ---- Unified Math Engine Types ----

export type MathTask =
  | { type: "position-size"; input: PositionSizeInput }
  | { type: "prop-firm-plan"; input: PropFirmPlanInput }
  | { type: "compounding-plan"; input: CompoundingPlanInput };

export type MathTaskResult =
  | { type: "position-size"; result: PositionSizeResult }
  | { type: "prop-firm-plan"; result: PropFirmPlanResult }
  | { type: "compounding-plan"; result: CompoundingPlanResult };

// ---------- Core math functions ----------

export function calculatePositionSize(
  input: PositionSizeInput
): PositionSizeResult {
  const { accountSize, riskPercent, stopLossPoints, valuePerPoint } = input;

  if (accountSize <= 0) throw new Error("Account size must be > 0");
  if (riskPercent <= 0) throw new Error("Risk percent must be > 0");
  if (stopLossPoints <= 0) throw new Error("Stop loss points must be > 0");
  if (valuePerPoint <= 0) throw new Error("Value per point must be > 0");

  const riskAmount = (accountSize * riskPercent) / 100;
  const positionSize = riskAmount / (stopLossPoints * valuePerPoint);

  return {
    riskAmount,
    positionSize,
    riskPercent,
    stopLossPoints,
    valuePerPoint,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateLosingStreak(winratePct: number): number {
  const winrate = clamp(winratePct / 100, 0.01, 0.99);
  const lossProb = 1 - winrate;

  // approx longest losing streak (95% tail, ~100 trades)
  const losingStreak = Math.log(0.05) / Math.log(lossProb);
  const rounded = Math.max(1, Math.round(losingStreak));
  return rounded;
}

export function buildPropFirmPlan(
  input: PropFirmPlanInput
): PropFirmPlanResult {
  const { config, riskPerTradePct, expectedRR, expectedWinratePct, maxTradesPerDay } =
    input;
  const {
    accountSize,
    currency,
    targetReturnPct,
    maxDailyDrawdownPct,
    maxTotalDrawdownPct,
  } = config;

  if (accountSize <= 0) throw new Error("Account size must be > 0");
  if (maxTradesPerDay <= 0) throw new Error("maxTradesPerDay must be > 0");

  const dailyLossLimitAmount = (accountSize * maxDailyDrawdownPct) / 100;
  const totalLossLimitAmount = (accountSize * maxTotalDrawdownPct) / 100;
  const targetProfitAmount = (accountSize * targetReturnPct) / 100;

  const estimatedLosingStreak = estimateLosingStreak(expectedWinratePct);

  const maxRiskPerTradePctByDailyRule = maxDailyDrawdownPct / maxTradesPerDay;
  const maxRiskPerTradePctByTotalRule =
    maxTotalDrawdownPct / estimatedLosingStreak;

  const safeRiskPerTradePct = Math.min(
    maxRiskPerTradePctByDailyRule,
    maxRiskPerTradePctByTotalRule,
    riskPerTradePct
  );

  const notes: string[] = [];

  notes.push(`Account: ${accountSize.toFixed(2)} ${currency}`);
  notes.push(
    `Target profit: ${targetReturnPct}% → ${targetProfitAmount.toFixed(
      2
    )} ${currency}`
  );
  notes.push(
    `Max daily drawdown: ${maxDailyDrawdownPct}% → ${dailyLossLimitAmount.toFixed(
      2
    )} ${currency}`
  );
  notes.push(
    `Max total drawdown: ${maxTotalDrawdownPct}% → ${totalLossLimitAmount.toFixed(
      2
    )} ${currency}`
  );
  notes.push(
    `Estimated worst losing streak (~100 trades, 95% tail): ~${estimatedLosingStreak} losses in a row`
  );
  notes.push(
    `Max risk per trade by daily rule: ~${maxRiskPerTradePctByDailyRule.toFixed(
      2
    )}%`
  );
  notes.push(
    `Max risk per trade by total rule: ~${maxRiskPerTradePctByTotalRule.toFixed(
      2
    )}%`
  );
  notes.push(
    `Chosen safe risk per trade: ${safeRiskPerTradePct.toFixed(
      2
    )}% (input: ${riskPerTradePct}%)`
  );
  notes.push(
    `Expected R:R = ${expectedRR}, expected winrate = ${expectedWinratePct}%`
  );

  return {
    dailyLossLimitPct: maxDailyDrawdownPct,
    dailyLossLimitAmount,
    totalLossLimitPct: maxTotalDrawdownPct,
    totalLossLimitAmount,
    targetProfitPct: targetReturnPct,
    targetProfitAmount,
    maxRiskPerTradePctByDailyRule,
    maxRiskPerTradePctByTotalRule,
    safeRiskPerTradePct,
    estimatedLosingStreak,
    notes,
  };
}

export function buildCompoundingPlan(
  input: CompoundingPlanInput
): CompoundingPlanResult {
  const {
    startingBalance,
    riskPerTradePct,
    expectedRR,
    expectedWinratePct,
    numberOfTrades,
  } = input;

  if (startingBalance <= 0) throw new Error("Starting balance must be > 0");
  if (riskPerTradePct <= 0) throw new Error("Risk per trade percent must be > 0");
  if (numberOfTrades <= 0) throw new Error("Number of trades must be > 0");

  const winrate = expectedWinratePct / 100;
  const lossRate = 1 - winrate;

  const expectedR = winrate * expectedRR - lossRate * 1;
  const riskFraction = riskPerTradePct / 100;
  const growthFactorPerTrade = 1 + riskFraction * expectedR;

  let balance = startingBalance;
  const steps: CompoundingStep[] = [];

  for (let i = 1; i <= numberOfTrades; i++) {
    balance = balance * growthFactorPerTrade;
    steps.push({
      tradeNumber: i,
      balance: Number(balance.toFixed(2)),
    });
  }

  const endingBalance = Number(balance.toFixed(2));

  return {
    startingBalance,
    endingBalance,
    growthFactorPerTrade,
    numberOfTrades,
    steps,
  };
}

// ---------- Dispatcher (this is what your API route wants) ----------

export function runMathTask(task: MathTask): MathTaskResult {
  switch (task.type) {
    case "position-size": {
      const result = calculatePositionSize(task.input);
      return { type: "position-size", result };
    }
    case "prop-firm-plan": {
      const result = buildPropFirmPlan(task.input);
      return { type: "prop-firm-plan", result };
    }
    case "compounding-plan": {
      const result = buildCompoundingPlan(task.input);
      return { type: "compounding-plan", result };
    }
    default: {
      const _never: never = task;
      throw new Error("Unknown math task type");
    }
  }
}

// ---------- Percent-of-target helpers (used in chat & telegram routes) ----------

// Detect if user is asking: "what percent of my target have I hit" style questions
export function isPercentOfTargetQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  const hasPercentWord = lower.includes("percent") || lower.includes("%");
  const hasTargetWord =
    lower.includes("target") ||
    lower.includes("eval") ||
    lower.includes("evaluation") ||
    lower.includes("challenge");

  const numberMatches = text.match(/-?\d+(\.\d+)?/g) || [];
  return hasPercentWord && hasTargetWord && numberMatches.length >= 2;
}

// Build a natural-language answer from a text containing two numbers
// Example: "I made 4500 and target is 8000, what percent of target?"
export function buildPercentOfTargetAnswerFromText(
  text: string
): string | null {
  const numbers = text.match(/-?\d+(\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;

  const a = parseFloat(numbers[0]);
  const b = parseFloat(numbers[1]);

  if (!isFinite(a) || !isFinite(b) || b === 0) return null;

  // assume: a = current, b = target
  const current = a;
  const target = b;

  const percent = (current / target) * 100;
  const remaining = target - current;
  const remainingPct = 100 - percent;

  return [
    `You've completed ~${percent.toFixed(2)}% of your target.`,
    `Current: ${current}, Target: ${target}.`,
    remaining >= 0
      ? `You need ${remaining.toFixed(
          2
        )} more (${remainingPct.toFixed(2)}% of the target) to hit it.`
      : `You've exceeded the target by ${Math.abs(remaining).toFixed(
          2
        )} (that's ${Math.abs(remainingPct).toFixed(2)}% over the target).`,
  ].join(" ");
}

// Optional: a formatter if you ever need textual summary from a MathTask
export function formatEvalAnswer(task: MathTask): string {
  const result = runMathTask(task);

  switch (result.type) {
    case "position-size": {
      const r = result.result;
      return `Risking ${r.riskPercent}% = ${r.riskAmount.toFixed(
        2
      )} with a stop of ${r.stopLossPoints} points at ${r.valuePerPoint} per point → position size ~ ${r.positionSize.toFixed(
        3
      )}.`;
    }
    case "prop-firm-plan": {
      const r = result.result;
      return [
        `Target: ${r.targetProfitPct}% (${r.targetProfitAmount.toFixed(
          2
        )}).`,
        `Daily loss limit: ${r.dailyLossLimitPct}% (${r.dailyLossLimitAmount.toFixed(
          2
        )}).`,
        `Total loss limit: ${r.totalLossLimitPct}% (${r.totalLossLimitAmount.toFixed(
          2
        )}).`,
        `Safe risk per trade ≈ ${r.safeRiskPerTradePct.toFixed(2)}%.`,
      ].join(" ");
    }
    case "compounding-plan": {
      const r = result.result;
      return `Starting from ${r.startingBalance}, after ${
        r.numberOfTrades
      } trades, expected balance ≈ ${r.endingBalance} (growth factor per trade ~ ${r.growthFactorPerTrade.toFixed(
        4
      )}).`;
    }
    default:
      return "Unknown math result.";
  }
}
