// FILE: src/lib/math-engine.ts
// Edge-safe lightweight math engine for Jarvis (no external deps, no eval).
// Supports:
//  - "X% of Y" or "X percent of Y"
//  - "what percent is A of B"
//  - basic arithmetic expressions with + - * / and parentheses (no % operator)
// Deterministic numeric parsing, no dynamic code evaluation.

type Numeric = number | string;

class TinyBig {
  n: bigint;
  scale: bigint;
  constructor(value: Numeric, scale = 8) {
    this.scale = BigInt(10) ** BigInt(scale);
    const asNum = typeof value === "number" ? value : parseFloat(String(value));
    const normalized = Number.isFinite(asNum) ? asNum : 0;
    this.n = BigInt(Math.round(normalized * Number(this.scale)));
  }
  static fromBigInt(n: bigint, scale: bigint) {
    const obj = Object.create(TinyBig.prototype) as TinyBig;
    obj.n = n;
    obj.scale = scale;
    return obj;
  }
  add(o: TinyBig) {
    this._assertSameScale(o);
    return TinyBig.fromBigInt(this.n + o.n, this.scale);
  }
  sub(o: TinyBig) {
    this._assertSameScale(o);
    return TinyBig.fromBigInt(this.n - o.n, this.scale);
  }
  mul(o: TinyBig) {
    this._assertSameScale(o);
    return TinyBig.fromBigInt((this.n * o.n) / this.scale, this.scale);
  }
  div(o: TinyBig) {
    this._assertSameScale(o);
    if (o.n === 0n) throw new Error("Division by zero");
    return TinyBig.fromBigInt((this.n * this.scale) / o.n, this.scale);
  }
  toNumber() {
    return Number(this.n) / Number(this.scale);
  }
  toFixed(dec = 6) {
    return this.toNumber().toFixed(dec);
  }
  _assertSameScale(o: TinyBig) {
    if (this.scale !== o.scale) throw new Error("Scale mismatch");
  }
  static from(value: Numeric, scale = 8) {
    return new TinyBig(value, scale);
  }
}

export function parseNumber(x: Numeric): number | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim().replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return null;
}

export function percentOf(percent: Numeric, total: Numeric, precision = 8) {
  const p = parseNumber(percent);
  const t = parseNumber(total);
  if (p === null || t === null) return { ok: false, error: "Invalid numeric inputs" };
  const A = TinyBig.from(p, precision);
  const B = TinyBig.from(t, precision);
  const H = TinyBig.from(100, precision);
  try {
    const numerator = A.mul(B);
    const result = numerator.div(H);
    return { ok: true, result: result.toNumber() };
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

export function whatPercentIs(aVal: Numeric, bVal: Numeric, precision = 8) {
  const a = parseNumber(aVal);
  const b = parseNumber(bVal);
  if (a === null || b === null || b === 0) return { ok: false, error: "Invalid inputs or division by zero" };
  const A = TinyBig.from(a, precision);
  const B = TinyBig.from(b, precision);
  try {
    const ratio = A.div(B);
    const percent = ratio.mul(TinyBig.from(100, precision));
    return { ok: true, percent: percent.toNumber() };
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

/* -------------------------
   Tiny expression evaluator
   Supports: numbers, + - * /, parentheses
   Implementation: Shunting-yard (to RPN) + RPN eval
   No eval(), no dynamic code, safe for Edge runtime.
   ------------------------- */

function isDigit(ch: string) {
  return /[0-9.]/.test(ch);
}
function tokenizeExpression(expr: string) {
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (isDigit(c)) {
      let num = c;
      i++;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i++];
      }
      out.push(num);
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "(" || c === ")") {
      out.push(c);
      i++;
      continue;
    }
    // unknown char -> invalid
    return { ok: false, error: `Invalid character '${c}' in expression` };
  }
  return { ok: true, tokens: out };
}

function precedence(op: string) {
  if (op === "+" || op === "-") return 1;
  if (op === "*" || op === "/") return 2;
  return 0;
}

function toRPN(tokens: string[]) {
  const output: string[] = [];
  const ops: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[0-9.]+$/.test(t)) {
      output.push(t);
    } else if (t === "+" || t === "-" || t === "*" || t === "/") {
      while (ops.length && ops[ops.length - 1] !== "(" && precedence(ops[ops.length - 1]) >= precedence(t)) {
        output.push(ops.pop()!);
      }
      ops.push(t);
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") {
        output.push(ops.pop()!);
      }
      if (!ops.length || ops[ops.length - 1] !== "(") {
        return { ok: false, error: "Mismatched parentheses" };
      }
      ops.pop(); // remove "("
    } else {
      return { ok: false, error: `Invalid token ${t}` };
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(" || op === ")") return { ok: false, error: "Mismatched parentheses" };
    output.push(op);
  }
  return { ok: true, rpn: output };
}

function evalRPN(rpn: string[]) {
  const stack: number[] = [];
  for (let i = 0; i < rpn.length; i++) {
    const t = rpn[i];
    if (/^[0-9.]+$/.test(t)) {
      stack.push(Number(t));
    } else if (t === "+" || t === "-" || t === "*" || t === "/") {
      if (stack.length < 2) return { ok: false, error: "Invalid expression" };
      const b = stack.pop()!;
      const a = stack.pop()!;
      let res = 0;
      if (t === "+") res = a + b;
      else if (t === "-") res = a - b;
      else if (t === "*") res = a * b;
      else if (t === "/") {
        if (b === 0) return { ok: false, error: "Division by zero" };
        res = a / b;
      }
      stack.push(res);
    } else {
      return { ok: false, error: `Unknown RPN token ${t}` };
    }
  }
  if (stack.length !== 1) return { ok: false, error: "Invalid expression result" };
  return { ok: true, value: stack[0] };
}

/* parseAndCompute: main entry */
export function parseAndCompute(text: string) {
  if (!text || typeof text !== "string") return { ok: false, answer: "No text" };
  const cleaned = text.replace(/,/g, "").trim().toLowerCase();

  // 1) X% of Y
  const m = cleaned.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent)\s*(?:of)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (m) {
    const pct = m[1];
    const tot = m[2];
    const r = percentOf(pct, tot, 10);
    if (r.ok) return { ok: true, answer: `${pct}% of ${tot} = ${r.result}`, details: r };
    return { ok: false, answer: r.error };
  }

  // 2) what percent is A of B
  const m2 = cleaned.match(/what\s+percent\s+is\s+([0-9]+(?:\.[0-9]+)?)\s+of\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (m2) {
    const a = m2[1];
    const b = m2[2];
    const r = whatPercentIs(a, b, 10);
    if (r.ok) return { ok: true, answer: `${a} is ${r.percent}% of ${b}`, details: r };
    return { ok: false, answer: r.error };
  }

  // 3) simple arithmetic expression (digits, + - * / and parentheses)
  const exprMatch = cleaned.match(/^([0-9\.\s\+\-\*\/\(\)]+)$/);
  if (exprMatch) {
    const expr = exprMatch[1];
    // tokenize
    const tok = tokenizeExpression(expr);
    if (!tok.ok) return { ok: false, answer: tok.error };
    const rpn = toRPN(tok.tokens);
    if (!rpn.ok) return { ok: false, answer: rpn.error };
    const evalRes = evalRPN(rpn.rpn);
    if (!evalRes.ok) return { ok: false, answer: evalRes.error };
    return { ok: true, answer: String(evalRes.value), details: { value: evalRes.value } };
  }

  return { ok: false, answer: "Could not parse a deterministic math expression from the text." };
}

export default {
  percentOf,
  whatPercentIs,
  parseAndCompute,
};
