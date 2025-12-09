// src/lib/math-engine.ts
// Deterministic math engine for Jarvis — safe calculations for trading and prop-firm rules.
// Uses mathjs for parsing and numeric safety. Do NOT delegate core numeric ops to LLMs.

import { create, all } from 'mathjs';

const math = create(all, {
  number: 'number',
  precision: 14,
});

// Types
export type PositionSizingResult = {
  positionSizeUnits: number;
  positionSizeCurrency: number;
  riskPercent: number;
  riskAmount: number;
  leverage?: number | null;
  details?: string;
};

export type PropFirmCheckResult = {
  pass: boolean;
  equity: number;
  dailyMaxLoss: number;
  totalMaxLoss: number;
  requiredRunTarget: number;
  note?: string;
};

// Helper: parse number safely
export function safeNumber(input: number | string, fallback = 0): number {
  if (input === null || input === undefined) return fallback;
  const n = typeof input === 'number' ? input : Number(String(input).replace(/[, ]+/g, ''));
  if (Number.isFinite(n)) return n;
  return fallback;
}

// Basic position sizing by risk percent or absolute risk
// - equity: account equity (number)
// - risk: either percentage (e.g., 1.0 for 1%) or absolute amount (if isAbsolute true)
// - entryPrice, stopPrice: numbers
// - lotSizePerUnit: multiplier for one contract/lot value (e.g., 1 for stocks, contract size for futures)
// - currencyPerUnit: price * lotSizePerUnit by default
export function computePositionSizing({
  equity,
  riskPercent,
  riskAmount,
  isRiskAbsolute = false,
  entryPrice,
  stopPrice,
  lotSizePerUnit = 1,
}: {
  equity: number;
  riskPercent?: number;
  riskAmount?: number;
  isRiskAbsolute?: boolean;
  entryPrice: number;
  stopPrice: number;
  lotSizePerUnit?: number;
}): PositionSizingResult {
  const E = safeNumber(equity, 0);
  const entry = safeNumber(entryPrice, 0);
  const stop = safeNumber(stopPrice, 0);
  if (entry <= 0 || stop <= 0) {
    throw new Error('Invalid entry or stop price');
  }
  // compute per-unit risk in currency
  const perUnitRisk = Math.abs(entry - stop) * lotSizePerUnit;
  if (perUnitRisk === 0) throw new Error('Per-unit risk is zero (entry == stop)');

  let riskAmt = 0;
  if (isRiskAbsolute) {
    riskAmt = safeNumber(riskAmount, 0);
  } else {
    const rp = safeNumber(riskPercent, 0);
    riskAmt = (rp / 100) * E;
  }
  // compute number of units
  const units = Math.floor(riskAmt / perUnitRisk);
  const positionCurrency = units * entry * lotSizePerUnit;
  const actualRiskPercent = E > 0 ? (riskAmt / E) * 100 : 0;
  return {
    positionSizeUnits: units,
    positionSizeCurrency: positionCurrency,
    riskPercent: actualRiskPercent,
    riskAmount: riskAmt,
    details: `Per-unit risk ${perUnitRisk.toFixed(8)}`,
  };
}

// Convert absolute risk to risk percent
export function convertRiskAmountToPercent({ equity, riskAmount }: { equity: number; riskAmount: number }) {
  const E = safeNumber(equity, 0);
  if (E === 0) return 0;
  return (safeNumber(riskAmount, 0) / E) * 100;
}

// R-multiple calculation: reward / risk
export function computeRMultiple({ entry, stop, target, lotSizePerUnit = 1 }: { entry: number; stop: number; target: number; lotSizePerUnit?: number }) {
  const perUnitRisk = Math.abs(entry - stop) * lotSizePerUnit;
  const perUnitReward = Math.abs(target - entry) * lotSizePerUnit;
  if (perUnitRisk === 0) throw new Error('Per-unit risk is zero');
  return {
    rMultiple: perUnitReward / perUnitRisk,
    perUnitRisk,
    perUnitReward,
  };
}

// Prop-firm quick check: given initial balance and rules, check if a run passes basic loss rules
export function quickPropFirmCheck({
  startingBalance,
  currentEquity,
  dailyMaxLossPercent,
  totalMaxLossPercent,
  requiredTargetPercent,
}: {
  startingBalance: number;
  currentEquity: number;
  dailyMaxLossPercent: number;
  totalMaxLossPercent: number;
  requiredTargetPercent: number;
}): PropFirmCheckResult {
  const S = safeNumber(startingBalance, 0);
  const C = safeNumber(currentEquity, 0);
  const dailyMaxLoss = (dailyMaxLossPercent / 100) * S;
  const totalMaxLoss = (totalMaxLossPercent / 100) * S;
  const requiredTarget = (requiredTargetPercent / 100) * S;
  const drawdown = S - C;
  const pass = !(drawdown > totalMaxLoss || drawdown > dailyMaxLoss);
  const note = `Drawdown ${drawdown.toFixed(2)} | dailyMax ${dailyMaxLoss.toFixed(2)} | totalMax ${totalMaxLoss.toFixed(2)} | target ${requiredTarget.toFixed(2)}`;
  return {
    pass,
    equity: C,
    dailyMaxLoss,
    totalMaxLoss,
    requiredRunTarget: requiredTarget,
    note,
  };
}

// Small helper to evaluate safe math expressions (no eval) — supports expressions like "1000 * 0.01"
export function evaluateExpression(expr: string): number {
  try {
    const r = math.evaluate(expr);
    if (typeof r === 'number' && Number.isFinite(r)) return r;
    if (r && typeof r.valueOf === 'function') {
      const v = r.valueOf();
      if (typeof v === 'number') return v;
    }
    throw new Error('Expression did not produce a finite number');
  } catch (e) {
    throw new Error(`Invalid expression: ${expr} (${String(e)})`);
  }
}

// Expose functions
export default {
  computePositionSizing,
  convertRiskAmountToPercent,
  computeRMultiple,
  quickPropFirmCheck,
  evaluateExpression,
};
