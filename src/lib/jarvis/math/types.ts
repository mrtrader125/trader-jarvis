// /lib/jarvis/math/types.ts

export type Currency = string;

export interface AccountProfile {
  accountSize: number;        // e.g. 100000
  currency: Currency;         // e.g. "USD"
  maxDailyDrawdownPct?: number;
  maxTotalDrawdownPct?: number;
  targetReturnPct?: number;
}

export interface PositionSizeInput {
  accountSize: number;        // current balance or prop firm balance
  riskPercent: number;        // % of account per trade (e.g. 1)
  stopLossPoints: number;     // pips / points
  valuePerPoint: number;      // money per pip/point per 1 lot or 1 unit
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
  targetReturnPct: number;        // e.g. 8
  maxDailyDrawdownPct: number;    // e.g. 5
  maxTotalDrawdownPct: number;    // e.g. 10
  minTradingDays?: number;
  phase?: 1 | 2 | 3;
}

export interface PropFirmPlanInput {
  config: PropFirmConfig;
  riskPerTradePct: number;        // your intended risk per trade
  expectedRR: number;             // average reward:risk, e.g. 2
  expectedWinratePct: number;     // e.g. 45
  maxTradesPerDay: number;        // hard cap
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
