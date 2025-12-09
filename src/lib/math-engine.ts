// src/lib/math-engine.ts
/**
 * Minimal math engine helpers used across the project.
 * Add more deterministic functions here as needed.
 */

export function percentOf(value: number, percent: number) {
  return (value * percent) / 100;
}

export function toFixedNumber(n: number, decimals = 2) {
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}

/** Example: compound growth calculator */
export function compoundGrowth(principal: number, ratePercent: number, periods: number) {
  const rate = ratePercent / 100;
  return principal * Math.pow(1 + rate, periods);
}

export default { percentOf, toFixedNumber, compoundGrowth };
