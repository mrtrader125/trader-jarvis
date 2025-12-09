// FILE: src/lib/math-engine.ts
// Lightweight math engine replacement to avoid heavy external deps (mathjs).
// Provides deterministic, precise basic arithmetic for Jarvis use-cases.
// Uses built-in Number and a small BigInt-backed TinyBig for higher precision when needed.

// Keep this file Edge-safe: no external packages, only built-in JS features.

type Numeric = number | string;

// TinyBig: small fixed-scale BigInt wrapper for moderate-precision arithmetic
class TinyBig {
  n: bigint;
  scale: bigint;

  constructor(value: Numeric, scale = 8) {
    this.scale = BigInt(10) ** BigInt(scale);
    const asNum = typeof value === "number" ? value : parseFloat(String(value));
    // protect NaN
    const normalized = Number.isFinite(asNum) ? asNum : 0;
    this.n = BigInt(Math.round(normalized * Number(this.scale)));
  }

  static fromBigInt(n: bigint, scale: bigint) {
    const obj = Object.create(TinyBig.prototype) as TinyBig;
    obj.n = n;
    obj.scale = scale;
    return obj;
  }

  add(other: TinyBig) {
    this._assertSameScale(other);
    return TinyBig.fromBigInt(this.n + other.n, this.scale);
  }
  sub(other: TinyBig) {
    this._assertSameScale(other);
    return TinyBig.fromBigInt(this.n - other.n, this.scale);
  }
  mul(other: TinyBig) {
    // (a * b) / scale
    const r = (this.n * other.n) / this.scale;
    return TinyBig.fromBigInt(r, this.scale);
  }
  div(other: TinyBig) {
    // (a * scale) / b
    if (other.n === 0n) throw new Error("Division by zero");
    const r = (this.n * this.scale) / other.n;
    return TinyBig.fromBigInt(r, this.scale);
  }
  toNumber() {
    return Number(this.n) / Number(this.scale);
  }
  toFixed(dec = 6) {
    return this.toNumber().toFixed(dec);
  }
  _assertSameScale(other: TinyBig) {
    if (this.scale !== other.scale) {
      throw new Error("Scale mismatch");
    }
  }
  static from(value: Numeric, scale = 8) {
    return new TinyBig(value, scale);
  }
}

// Utility parsing
export function parseNumber(x: Numeric): number | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim().replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return null;
}

/** percentOf: percent% of total => result number */
export function percentOf(percent: Numeric, total: Numeric, precision = 8) {
  const p = parseNumber(percent);
  const t = parseNumber(total);
  if (p === null || t === null) return { ok: false, error: "Invalid numeric inputs" };

  const A = TinyBig.from(p, precision);
  const B = TinyBig.from(t, precision);
  const H = TinyBig.from(100, precision);

  try {
    const numerator = A.mul(B); // p * t
    const result = numerator.div(H); // (p*t)/100
    return { ok: true, result: result.toNumber() };
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

/** whatPercentIs: a is what percent of b => return percent number */
export function whatPercentIs(aVal: Numeric, bVal: Numeric, precision = 8) {
  const a = parseNumber(aVal);
  const b = parseNumber(bVal);
  if (a === null || b === null || b === 0) return { ok: false, error: "Invalid inputs or division by zero" };

  const A = TinyBig.from(a, precision);
  const B = TinyBig.from(b, precision);

  try {
    const ratio = A.div(B); // a / b
    const percent = ratio.mul(TinyBig.from(100, precision)); // *100
    return { ok: true, percent: percent.toNumber() };
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

/** parseAndCompute: attempt to parse deterministic math from text:
 *  - "X% of Y", "X percent of Y"
 *  - "what percent is A of B"
 *  - very simple arithmetic expressions like "2 + 2" (no percent operator)
 */
export function parseAndCompute(text: string) {
  if (!text || typeof text !== "string") return { ok: false, answer: "No text" };
  const cleaned = text.replace(/,/g, "").trim().toLowerCase();

  // Pattern 1: "X% of Y" or "X percent of Y"
  const m = cleaned.match(/([0-9]+(?:\.[0-9]+)?)\\s*(?:%|percent)\\s*(?:of)?\\s*([0-9]+(?:\\.[0-9]+)?)/i);
  if (m) {
    const pct = m[1];
    const tot = m[2];
    const r = percentOf(pct, tot, 10);
    if (r.ok) return { ok: true, answer: `${pct}% of ${tot} = ${r.result}`, details: r };
    return { ok: false, answer: r.error };
  }

  // Pattern 2: "what percent is A of B"
  const m2 = cleaned.match(/what\\s+percent\\s+is\\s+([0-9]+(?:\\.[0-9]+)?)\\s+of\\s+([0-9]+(?:\\.[0-9]+)?)/i);
  if (m2) {
    const a = m2[1];
    const b = m2[2];
    const r = whatPercentIs(a, b, 10);
    if (r.ok) return { ok: true, answer: `${a} is ${r.percent}% of ${b}`, details: r };
    return { ok: false, answer: r.error };
  }

  // Pattern 3: very small arithmetic expression (digits, + - * / and parentheses)
  const exprMatch = cleaned.match(/^([0-9\\.\\s\\+\\-\\*\\/\\(\\)]+)$/);
  if (exprMatch) {
    try {
      const expr = exprMatch[1].replace(/[^0-9\\.\\+\\-\\*\\/\\(\\)\\s]/g, "");
      // Disallow '%' symbol in generic eval
      if (expr.includes("%")) {
        return { ok: false, answer: "Percent operator not supported in generic expressions" };
      }
      // eslint-disable-next-line no-eval
      const val = eval(expr);
      if (typeof val === "number" && Number.isFinite(val)) return { ok: true, answer: String(val), details: { value: val } };
    } catch (e) {
      // fall through
    }
  }

  return { ok: false, answer: "Could not parse a deterministic math expression from the text." };
}

export default {
  percentOf,
  whatPercentIs,
  parseAndCompute,
};
