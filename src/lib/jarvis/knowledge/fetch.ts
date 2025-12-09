// /lib/jarvis/knowledge/fetch.ts
import { createClient } from "@/lib/supabase/server";
import { KnowledgeItem, KnowledgeStatus } from "./types";

interface ListOptions {
  moduleSlug?: string;
  status?: KnowledgeStatus;
  search?: string;
  limit?: number;
}

export async function listKnowledgeItems(
  options: ListOptions = {}
): Promise<KnowledgeItem[]> {
  const supabase = createClient();
  let query = supabase
    .from("jarvis_knowledge_items")
    .select("*, jarvis_knowledge_modules!inner(slug)")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }
  if (options.moduleSlug) {
    query = query.eq("jarvis_knowledge_modules.slug", options.moduleSlug);
  }
  if (options.search) {
    query = query.ilike("title", `%${options.search}%`);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as unknown as KnowledgeItem[];
}
