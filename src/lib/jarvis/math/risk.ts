// /lib/jarvis/math/risk.ts
import { PositionSizeInput, PositionSizeResult } from "./types";

export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { accountSize, riskPercent, stopLossPoints, valuePerPoint } = input;

  if (accountSize <= 0) {
    throw new Error("Account size must be greater than 0.");
  }
  if (riskPercent <= 0) {
    throw new Error("Risk percent must be greater than 0.");
  }
  if (stopLossPoints <= 0) {
    throw new Error("Stop loss points must be greater than 0.");
  }
  if (valuePerPoint <= 0) {
    throw new Error("Value per point must be greater than 0.");
  }

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
