"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";

interface KnowledgeModule {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export default function ModulesAdminPage() {
  const [modules, setModules] = useState<KnowledgeModule[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadModules() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/jarvis/modules/list");
      const data = await res.json();
      if (!data.ok) {
        setMessage("Failed to load modules: " + data.error);
      } else {
        setModules(data.modules);
      }
    } catch (err: any) {
      setMessage("Error loading modules: " + (err?.message ?? "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadModules();
  }, []);

  function selectModule(mod: KnowledgeModule) {
    setSelectedId(mod.id);
    setEditName(mod.name || "");
    setEditSlug(mod.slug || "");
    setEditDescription(mod.description || "");
    setMergeTargetId("");
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/jarvis/modules/update", {
        method: "POST",
        body: JSON.stringify({
          id: selectedId,
          name: editName,
          slug: editSlug,
          description: editDescription,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage("Save error: " + data.error);
      } else {
        setMessage("Module updated.");
        await loadModules();
        // Re-select updated module
        const updated = data.module as KnowledgeModule;
        selectModule(updated);
      }
    } catch (err: any) {
      setMessage("Save failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !mergeTargetId) return;
    setMergeLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/jarvis/modules/merge", {
        method: "POST",
        body: JSON.stringify({
          sourceId: selectedId,
          targetId: mergeTargetId,
          deleteSource: true,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage("Merge error: " + data.error);
      } else {
        setMessage("Merged successfully. Source module deleted.");
        setSelectedId(null);
        setMergeTargetId("");
        await loadModules();
      }
    } catch (err: any) {
      setMessage("Merge failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setMergeLoading(false);
    }
  }

  const selectedModule = modules.find((m) => m.id === selectedId) || null;
  const mergeTargets = modules.filter((m) => m.id !== selectedId);

  return (
    <AdminGuard>
      <main className="max-w-6xl mx-auto px-4 pb-10 pt-4 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Knowledge Modules</h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Modules are buckets that group your rules and concepts
              (trading_psychology, money_freedom, math_engine, etc.).
              They are created automatically when you import training data,
              but you can rename, clean, and merge them here.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs text-emerald-400 hover:text-emerald-200"
          >
            ← Back to Admin
          </Link>
        </header>

        {message && (
          <div className="text-[11px] text-slate-200 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: list */}
          <section className="border border-slate-800 rounded-2xl bg-slate-900/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">All Modules</h2>
              {loading && (
                <span className="text-[10px] text-slate-500">Loading…</span>
              )}
            </div>
            <div className="space-y-1 max-h-[420px] overflow-auto">
              {modules.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => selectModule(mod)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border ${
                    mod.id === selectedId
                      ? "border-emerald-500 bg-slate-900"
                      : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold truncate">{mod.name}</span>
                    <span className="text-[10px] text-slate-500">
                      {mod.slug}
                    </span>
                  </div>
                  {mod.description && (
                    <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                      {mod.description}
                    </p>
                  )}
                </button>
              ))}
              {!loading && modules.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  No modules yet. They will appear automatically when you import knowledge.
                </p>
              )}
            </div>
          </section>

          {/* Right: edit + merge */}
          <section className="border border-slate-800 rounded-2xl bg-slate-900/60 p-4 space-y-4">
            {selectedModule ? (
              <>
                <h2 className="text-sm font-semibold mb-1">
                  Edit Module: {selectedModule.name}
                </h2>

                <form onSubmit={handleSave} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1">
                      Display name
                    </label>
                    <input
                      className="w-full border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Trading Psychology"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium mb-1">
                      Slug (used in JSON)
                    </label>
                    <input
                      className="w-full border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950 font-mono"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      placeholder="trading_psychology"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Spaces will become underscores, and characters will be
                      lowercased automatically.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium mb-1">
                      Description
                    </label>
                    <textarea
                      className="w-full border border-slate-700 rounded px-2 py-2 text-xs bg-slate-950 h-20"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Short explanation of this module."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-md bg-emerald-600 text-xs font-semibold hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </form>

                <div className="border-t border-slate-800 pt-3 mt-3 space-y-2">
                  <h3 className="text-xs font-semibold">
                    Merge this module into another
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    This moves all knowledge items from{" "}
                    <span className="font-mono">{selectedModule.slug}</span> into
                    another module and then deletes this module. Great for fixing
                    typos or cleaning duplicates.
                  </p>

                  <form
                    onSubmit={handleMerge}
                    className="flex flex-col sm:flex-row gap-2 items-start sm:items-center"
                  >
                    <select
                      className="border border-slate-700 rounded px-2 py-1 text-xs bg-slate-950 min-w-[160px]"
                      value={mergeTargetId}
                      onChange={(e) => setMergeTargetId(e.target.value)}
                    >
                      <option value="">Select target module…</option>
                      {mergeTargets.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.slug})
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={!mergeTargetId || mergeLoading}
                      className="px-3 py-1.5 rounded-md bg-red-600 text-[11px] font-semibold hover:bg-red-500 disabled:opacity-60"
                    >
                      {mergeLoading ? "Merging…" : "Merge & delete source"}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-500">
                Select a module on the left to edit its name, slug, or merge it
                into another module.
              </div>
            )}
          </section>
        </div>
      </main>
    </AdminGuard>
  );
}
