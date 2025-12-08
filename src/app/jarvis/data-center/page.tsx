"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";

type KnowledgeItemType = "rule" | "concept" | "formula" | "story" | "checklist";

interface KnowledgeItem {
  id: string;
  title: string;
  content_markdown: string;
  jarvis_instructions?: string | null;
  item_type: KnowledgeItemType;
  tags: string[];
  importance: number;
  status: string;
  created_at: string;
}

const BULK_TEMPLATE = `[
  {
    "moduleSlug": "trading_psychology",
    "title": "No revenge trading after a loss",
    "item_type": "rule",
    "importance": 5,
    "tags": ["trading", "psychology", "emotions", "revenge"],
    "status": "active",
    "jarvis_instructions": "When I have just lost money and feel angry or want to win it back fast, remind me of this rule. Tell me to stop trading, breathe, and step away from charts.",
    "content_markdown": "Explain clearly that after a loss streak I am not allowed to increase risk, add new trades just to win it back, or break my rules. My job is to stop, calm down, and come back only when I am stable again. You must protect me from emotional gambling."
  },
  {
    "moduleSlug": 'money_freedom',
    "title": "Minimum worry-free monthly money",
    "item_type": "concept",
    "importance": 4,
    "tags": ["money", "freedom", "runway", "expenses"],
    "status": "active",
    "jarvis_instructions": "Use this when we talk about financial freedom, runway, or how much I need to live calmly without panic.",
    "content_markdown": "Define my 'minimum worry-free' number as: fixed monthly expenses + a buffer % for unexpected things. When I ask about freedom money, calculate based on this and remind me I don't need massive profits every month if this number is covered."
  }
]`;

export default function JarvisDataCenterPage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    id: "",
    moduleSlug: "trading_psychology",
    title: "",
    content_markdown: "",
    jarvis_instructions:
      "Use this when the user is trading or talking about psychology.",
    item_type: "rule" as KnowledgeItemType,
    tags: "trading,psychology",
    importance: 3,
    status: "active",
  });

  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    const res = await fetch("/api/jarvis/knowledge/list");
    const data = await res.json();
    if (data.ok) setItems(data.items);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      id: form.id || undefined,
      moduleSlug: form.moduleSlug,
      title: form.title,
      content_markdown: form.content_markdown,
      jarvis_instructions: form.jarvis_instructions,
      item_type: form.item_type,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      importance: Number(form.importance),
      status: form.status as any,
    };

    const res = await fetch("/api/jarvis/knowledge/save", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!data.ok) {
      alert("Error: " + data.error);
      return;
    }

    setForm({
      ...form,
      id: "",
      title: "",
      content_markdown: "",
    });
    await loadItems();
  }

  function handleEdit(item: KnowledgeItem) {
    setForm({
      id: item.id,
      moduleSlug: "trading_psychology",
      title: item.title,
      content_markdown: item.content_markdown,
      jarvis_instructions: item.jarvis_instructions ?? "",
      item_type: item.item_type,
      tags: item.tags.join(","),
      importance: item.importance,
      status: item.status,
    });
  }

  async function handleCopyTemplate() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(BULK_TEMPLATE);
        setBulkResult("Template copied to clipboard. Paste it into any AI and ask it to fill more items.");
      } else {
        setBulkResult("Clipboard not available in this browser.");
      }
    } catch (err) {
      console.error(err);
      setBulkResult("Failed to copy template. You can still manually select and copy.");
    }
  }

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    setBulkResult(null);

    if (!bulkText.trim()) {
      setBulkResult("Paste some JSON data first.");
      return;
    }

    setBulkLoading(true);
    try {
      const res = await fetch("/api/jarvis/knowledge/bulk-import", {
        method: "POST",
        body: JSON.stringify({
          format: "json-v1",
          raw: bulkText,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        setBulkResult("Import error: " + data.error);
      } else {
        setBulkResult(`Imported ${data.count} items successfully.`);
        setBulkText("");
        await loadItems();
      }
    } catch (err: any) {
      console.error(err);
      setBulkResult("Import failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <AdminGuard>
      <div className="max-w-5xl mx-auto px-4 pb-10 pt-2 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Jarvis Knowledge Data Center</h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              This is the private brain editor. Anything you define here becomes
              part of Jarvis&apos;s doctrine for trading, psychology, money and
              life. Keep it clean and in your own words.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs text-emerald-400 hover:text-emerald-200"
          >
            ← Back to Admin
          </Link>
        </header>

        {/* ====== BULK IMPORT AREA ====== */}
        <section className="border border-slate-800 bg-slate-900/60 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Bulk Data Feeding</h2>
              <p className="text-[11px] text-slate-400 max-w-xl">
                Paste a JSON array of rules/concepts generated by any AI. We&apos;ll parse,
                classify and store everything for Jarvis in one shot.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyTemplate}
              className="text-[11px] px-3 py-1 rounded-md border border-emerald-600 text-emerald-300 hover:bg-emerald-600/10"
            >
              Copy example format
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                Paste JSON here
              </label>
              <textarea
                className="w-full h-40 border border-slate-700 rounded-md bg-slate-950 text-xs px-2 py-2 font-mono"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder='Example: [ { "moduleSlug": "trading_psychology", "title": "...", "content_markdown": "...", ... }, ... ]'
              />
              <p className="text-[10px] text-slate-500">
                Tip: Ask an AI like &quot;Fill this JSON template with 10 trading psychology
                rules in my voice&quot;, then paste the final JSON here.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                Example format (read-only)
              </label>
              <pre className="w-full h-40 border border-slate-800 rounded-md bg-slate-950 text-[10px] px-2 py-2 overflow-auto">
{BULK_TEMPLATE}
              </pre>
            </div>
          </div>

          <form onSubmit={handleBulkImport} className="flex items-center gap-3">
            <button
              type="submit"
              disabled={bulkLoading}
              className="px-4 py-1.5 rounded-md bg-emerald-600 text-xs font-semibold hover:bg-emerald-500 disabled:opacity-60"
            >
              {bulkLoading ? "Importing..." : "Import bulk data"}
            </button>
            {bulkResult && (
              <p className="text-[11px] text-slate-300">{bulkResult}</p>
            )}
          </form>
        </section>

        {/* ====== SINGLE ITEM FORM (OLD) ====== */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 border border-slate-800 bg-slate-900/50 rounded-2xl p-4"
        >
          <h2 className="text-sm font-semibold mb-1">
            Single Item Editor (fine-tuning / quick fixes)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Module</label>
              <select
                className="w-full border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950"
                value={form.moduleSlug}
                onChange={(e) =>
                  setForm((f) => ({ ...f, moduleSlug: e.target.value }))
                }
              >
                <option value="trading_psychology">Trading Psychology</option>
                <option value="math_engine">Math Engine</option>
                <option value="money_freedom">Money &amp; Freedom</option>
                <option value="life_design">Life Design</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Type (rule, concept, etc.)
              </label>
              <select
                className="w-full border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950"
                value={form.item_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    item_type: e.target.value as KnowledgeItemType,
                  }))
                }
              >
                <option value="rule">Rule</option>
                <option value="concept">Concept</option>
                <option value="formula">Formula</option>
                <option value="story">Story</option>
                <option value="checklist">Checklist</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Importance (1–5)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                className="w-full border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950"
                value={form.importance}
                onChange={(e) =>
                  setForm((f) => ({ ...f, importance: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Title</label>
            <input
              className="w-full border border-slate-700 rounded px-2 py-1 text-sm bg-slate-950"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="e.g. Never revenge trade after a loss"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Content (what you teach Jarvis)
            </label>
            <textarea
              className="w-full border border-slate-700 rounded px-2 py-2 text-sm bg-slate-950 h-32"
              value={form.content_markdown}
              onChange={(e) =>
                setForm((f) => ({ ...f, content_markdown: e.target.value }))
              }
              placeholder="Explain the concept, rule, formula, etc. in your own words..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Jarvis Instructions (how he should use this)
            </label>
            <textarea
              className="w-full border border-slate-700 rounded px-2 py-2 text-xs bg-slate-950 h-20"
              value={form.jarvis_instructions}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  jarvis_instructions: e.target.value,
                }))
              }
              placeholder="e.g. When I am tilted or emotional, bring this rule up and tell me to stop trading."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Tags</label>
              <input
                className="w-full border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950"
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="trading,psychology,emotions"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                className="w-full border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-emerald-600 text-xs font-semibold hover:bg-emerald-500"
          >
            {form.id ? "Update Knowledge Item" : "Create Knowledge Item"}
          </button>
        </form>

        {/* ====== LIST ====== */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Existing Items{" "}
            {loading && <span className="text-[10px] text-slate-500">(loading…)</span>}
          </h2>
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleEdit(item)}
                className="w-full text-left border border-slate-800 rounded-xl p-3 hover:bg-slate-900/60 bg-slate-950/60"
              >
                <div className="flex justify-between items-center">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-[10px] text-slate-500">
                    {item.item_type} · importance {item.importance}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                  {item.content_markdown}
                </p>
              </button>
            ))}
            {items.length === 0 && !loading && (
              <p className="text-xs text-slate-500">
                No knowledge yet. Start teaching Jarvis above.
              </p>
            )}
          </div>
        </section>
      </div>
    </AdminGuard>
  );
}
