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
            href="/"
            className="text-xs text-emerald-400 hover:text-emerald-200"
          >
            ← Back to Jarvis
          </Link>
        </header>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 border border-slate-800 bg-slate-900/50 rounded-2xl p-4"
        >
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

        {/* List */}
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
