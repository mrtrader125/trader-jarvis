// /app/jarvis/data-center/page.tsx
"use client";

import { useEffect, useState } from "react";

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
      moduleSlug: "trading_psychology", // or fetch real module slug later
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-3xl font-bold">Jarvis Knowledge Data Center</h1>
      <p className="text-sm text-gray-500">
        Teach Jarvis about trading psychology, math, money, and life rules here.
        Each entry becomes part of his brain.
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 border p-4 rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Module</label>
            <select
              className="w-full border rounded px-2 py-1"
              value={form.moduleSlug}
              onChange={(e) =>
                setForm((f) => ({ ...f, moduleSlug: e.target.value }))
              }
            >
              <option value="trading_psychology">Trading Psychology</option>
              <option value="math_engine">Math Engine</option>
              <option value="money_freedom">Money & Freedom</option>
              <option value="life_design">Life Design</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Type (rule, concept, etc.)
            </label>
            <select
              className="w-full border rounded px-2 py-1"
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
            <label className="block text-sm font-medium mb-1">
              Importance (1–5)
            </label>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full border rounded px-2 py-1"
              value={form.importance}
              onChange={(e) =>
                setForm((f) => ({ ...f, importance: Number(e.target.value) }))
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            className="w-full border rounded px-2 py-1"
            value={form.title}
            onChange={(e) =>
              setForm((f) => ({ ...f, title: e.target.value }))
            }
            placeholder="e.g. Never revenge trade after a loss"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Content (what you teach Jarvis)
          </label>
          <textarea
            className="w-full border rounded px-2 py-2 h-32"
            value={form.content_markdown}
            onChange={(e) =>
              setForm((f) => ({ ...f, content_markdown: e.target.value }))
            }
            placeholder="Explain the concept, rule, formula, etc. in your own words..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Jarvis Instructions (how he should use this)
          </label>
          <textarea
            className="w-full border rounded px-2 py-2 h-20"
            value={form.jarvis_instructions}
            onChange={(e) =>
              setForm((f) => ({ ...f, jarvis_instructions: e.target.value }))
            }
            placeholder="e.g. When user is tilted after a loss, remind them of this rule and suggest a break."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tags</label>
            <input
              className="w-full border rounded px-2 py-1"
              value={form.tags}
              onChange={(e) =>
                setForm((f) => ({ ...f, tags: e.target.value }))
              }
              placeholder="trading,psychology,emotions"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              className="w-full border rounded px-2 py-1"
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
          className="px-4 py-2 rounded bg-black text-white text-sm"
        >
          {form.id ? "Update Knowledge Item" : "Create Knowledge Item"}
        </button>
      </form>

      {/* List */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Existing Items {loading && <span className="text-xs">(loading…)</span>}
        </h2>
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleEdit(item)}
              className="w-full text-left border rounded p-3 hover:bg-gray-50"
            >
              <div className="flex justify-between items-center">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-gray-500">
                  {item.item_type} · importance {item.importance}
                </div>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">
                {item.content_markdown}
              </p>
            </button>
          ))}
          {items.length === 0 && !loading && (
            <p className="text-sm text-gray-500">
              No knowledge yet. Start teaching Jarvis above.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
