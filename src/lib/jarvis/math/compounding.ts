// /lib/jarvis/math/compounding.ts
import {
  CompoundingPlanInput,
  CompoundingPlanResult,
  CompoundingStep,
} from "./types";

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

  if (startingBalance <= 0) {
    throw new Error("Starting balance must be greater than 0.");
  }
  if (riskPerTradePct <= 0) {
    throw new Error("Risk per trade percent must be greater than 0.");
  }
  if (numberOfTrades <= 0) {
    throw new Error("Number of trades must be greater than 0.");
  }

  const winrate = expectedWinratePct / 100;
  const lossRate = 1 - winrate;

  // Expected R per trade
  const expectedR = winrate * expectedRR - lossRate * 1;

  // Expected balance multiplier per trade
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
