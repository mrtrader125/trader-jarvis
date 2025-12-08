// /lib/jarvis/math/propFirm.ts
import {
  PropFirmConfig,
  PropFirmPlanInput,
  PropFirmPlanResult,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateLosingStreak(winratePct: number): number {
  const winrate = clamp(winratePct / 100, 0.01, 0.99);
  const lossProb = 1 - winrate;

  // Approximate longest losing streak in 100 trades at 5% tail
  // L ≈ log(0.05) / log(lossProb)
  const losingStreak = Math.log(0.05) / Math.log(lossProb);
  const rounded = Math.max(1, Math.round(losingStreak));
  return rounded;
}

export function buildPropFirmPlan(input: PropFirmPlanInput): PropFirmPlanResult {
  const { config, riskPerTradePct, expectedRR, expectedWinratePct, maxTradesPerDay } = input;
  const {
    accountSize,
    currency,
    targetReturnPct,
    maxDailyDrawdownPct,
    maxTotalDrawdownPct,
  } = config;

  if (accountSize <= 0) {
    throw new Error("Account size must be greater than 0.");
  }
  if (maxTradesPerDay <= 0) {
    throw new Error("maxTradesPerDay must be greater than 0.");
  }

  const dailyLossLimitAmount = (accountSize * maxDailyDrawdownPct) / 100;
  const totalLossLimitAmount = (accountSize * maxTotalDrawdownPct) / 100;
  const targetProfitAmount = (accountSize * targetReturnPct) / 100;

  const estimatedLosingStreak = estimateLosingStreak(expectedWinratePct);

  // Max risk per trade from daily rule: assume worst-case all trades are losses
  const maxRiskPerTradePctByDailyRule = maxDailyDrawdownPct / maxTradesPerDay;

  // Max risk per trade from total rule: assume 1 full losing streak
  const maxRiskPerTradePctByTotalRule = maxTotalDrawdownPct / estimatedLosingStreak;

  const safeRiskPerTradePct = Math.min(
    maxRiskPerTradePctByDailyRule,
    maxRiskPerTradePctByTotalRule,
    riskPerTradePct
  );

  const notes: string[] = [];

  notes.push(
    `Account: ${accountSize.toFixed(2)} ${currency}`,
  );
  notes.push(
    `Target profit: ${targetReturnPct}% → ${targetProfitAmount.toFixed(2)} ${currency}`
  );
  notes.push(
    `Max daily drawdown: ${maxDailyDrawdownPct}% → ${dailyLossLimitAmount.toFixed(2)} ${currency}`
  );
  notes.push(
    `Max total drawdown: ${maxTotalDrawdownPct}% → ${totalLossLimitAmount.toFixed(2)} ${currency}`
  );
  notes.push(
    `Estimated worst losing streak (95% confidence, 100 trades): ~${estimatedLosingStreak} trades in a row`
  );
  notes.push(
    `Max risk per trade by daily rule (all trades lose in a day): ~${maxRiskPerTradePctByDailyRule.toFixed(
      2
    )}%`
  );
  notes.push(
    `Max risk per trade by total rule (one full losing streak): ~${maxRiskPerTradePctByTotalRule.toFixed(
      2
    )}%`
  );
  notes.push(
    `Chosen safe risk per trade: ${safeRiskPerTradePct.toFixed(2)}% (input: ${riskPerTradePct}%)`
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
