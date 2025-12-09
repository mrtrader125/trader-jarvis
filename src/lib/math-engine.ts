// src/lib/math-engine.ts
/**
 * Deterministic math engine for Jarvis.
 *
 * Uses mathjs for safe expression parsing & evaluation.
 * Only a small set of functions/operators are exposed.
 *
 * IMPORTANT: install mathjs in the project:
 *   npm install mathjs
 *
 * If you prefer not to add a dependency, tell me and I'll replace this file
 * with a minimal custom parser (but mathjs is safer and well-tested).
 */

import { create, all } from 'mathjs';

const config = {
  // number: 'BigNumber', // optional: use BigNumber for extreme precision
  // predictable: true,
};

const math = create(all, config);

// Create a safe subset (whitelist) for evaluate
const safeScope: Record<string, any> = {
  // Basic math functions
  abs: math.abs,
  ceil: math.ceil,
  floor: math.floor,
  round: math.round,
  min: math.min,
  max: math.max,
  // basic constants
  PI: Math.PI,
  E: Math.E,
};

// Allowed functions/operators are limited by not injecting full global scope.
// We'll use math.evaluate(expression, safeScope) which prevents direct access to global objects.
export function evaluateExpression(expr: string): number | string {
  if (!expr || typeof expr !== 'string') throw new Error('Expression must be a non-empty string');

  // Sanitize expression: disallow alphabetic function names except allowed ones (simple safeguard)
  // This is a lightweight check — math.evaluate with restricted scope is the primary safeguard.
  const forbiddenPattern = /([a-zA-Z_]\w*)/g;
  const resultAlpha = expr.match(forbiddenPattern);
  if (resultAlpha) {
    // allow matches only if they are known safe names (numbers are fine, but identifiers must be in safeScope)
    for (const id of resultAlpha) {
      if (!/^\d+$/.test(id) && typeof safeScope[id] === 'undefined') {
        // allow common variable names like 'e' or 'pi' (we included PI, E)
        // Block unknown identifiers to avoid code injection
        const ok = ['e', 'pi', 'E', 'PI'].includes(id);
        if (!ok) {
          throw new Error(`Unsafe identifier detected in expression: ${id}`);
        }
      }
    }
  }

  try {
    const val = math.evaluate(expr, safeScope);
    // Coerce to number if possible
    if (typeof val === 'number') return val;
    // mathjs sometimes returns BigNumber — convert to number safely if feasible
    if (val && typeof val.toNumber === 'function') {
      return val.toNumber();
    }
    return val;
  } catch (e: any) {
    throw new Error(`Math evaluation error: ${String(e?.message ?? e)}`);
  }
}

export default {
  evaluateExpression,
};
