// src/lib/jarvis/finance.ts

export type JarvisFinance = {
  user_id: string;
  eval_account_size: number | null;
  eval_target_percent: number | null;
  eval_target_amount: number | null;
  eval_current_profit: number | null;
  funded_account_size: number | null;
  funded_current_equity: number | null;
  monthly_living_cost: number | null;
  safe_monthly_return_percent: number | null;
  long_term_target_equity: number | null;
  notes: string | null;
  updated_at: string | null;
};

export async function loadFinance(supabase: any): Promise<JarvisFinance | null> {
  try {
    const { data, error } = await supabase
      .from("jarvis_finance")
      .select("*")
      .eq("user_id", "single-user")
      .single();

    if (error) {
      console.error("Error loading jarvis_finance:", error.message);
      return null;
    }
    return data as JarvisFinance;
  } catch (err) {
    console.error("Exception loading jarvis_finance:", err);
    return null;
  }
}

export function buildFinanceContextSnippet(finance: JarvisFinance | null): string {
  if (!finance) {
    return `
Financial snapshot (internal, currently minimal):
- No detailed finance row found for user_id "single-user" yet.
`.trim();
  }

  const f = finance;

  const lines: string[] = [];
  lines.push("Financial snapshot (internal context; use only when relevant):");

  lines.push(
    `- Evaluation / challenge: size ${f.eval_account_size ?? "?"}$, ` +
      `target ${f.eval_target_percent ?? "?"}% (${f.eval_target_amount ?? "?"}$), ` +
      `current profit ${f.eval_current_profit ?? "?"}$.`
  );

  lines.push(
    `- Funded / live: size ${f.funded_account_size ?? "none yet"}$, ` +
      `equity ${f.funded_current_equity ?? "n/a"}$.`
  );

  lines.push(
    `- Life needs: monthly living cost about ${f.monthly_living_cost ?? "?"}$, ` +
      `safe monthly return target ~${f.safe_monthly_return_percent ?? "?"}%.`
  );

  if (f.long_term_target_equity) {
    lines.push(
      `- Long-term: target total trading equity ${f.long_term_target_equity.toLocaleString()}$.`
    );
  }

  if (f.notes) {
    lines.push(`- Notes: ${f.notes}`);
  }

  lines.push(`
How to use this:
- When the user is stressed about money, random trades, or failing a challenge,
  remind him of what he already has and show that a calm monthly return close
  to "safe_monthly_return_percent" on his capital is often enough to cover his
  living cost.
- Do NOT bring this up in random small talk; only when he talks about risk,
  capital, financial stress, or asks if he is on the right path.
`.trim());

  return lines.join("\n");
}
