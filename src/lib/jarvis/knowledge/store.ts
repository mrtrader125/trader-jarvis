// /lib/jarvis/knowledge/store.ts
import { createClient } from "@/lib/supabase/server"; // adjust path to your helper
import {
  UpsertKnowledgeItemInput,
  KnowledgeItem,
  KnowledgeModule,
} from "./types";

async function getModuleBySlug(slug: string): Promise<KnowledgeModule | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jarvis_knowledge_modules")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data as KnowledgeModule | null;
}

export async function upsertKnowledgeItem(
  input: UpsertKnowledgeItemInput
): Promise<KnowledgeItem> {
  const supabase = createClient();

  let module_id: string | null = null;

  if (input.moduleSlug) {
    const module = await getModuleBySlug(input.moduleSlug);
    if (!module) {
      throw new Error(`Module with slug "${input.moduleSlug}" not found.`);
    }
    module_id = module.id;
  }

  const payload: any = {
    module_id,
    title: input.title,
    content_markdown: input.content_markdown,
    jarvis_instructions: input.jarvis_instructions ?? null,
    item_type: input.item_type ?? "rule",
    tags: input.tags ?? [],
    importance: input.importance ?? 1,
    status: input.status ?? "active",
  };

  let query;
  if (input.id) {
    query = supabase
      .from("jarvis_knowledge_items")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
  } else {
    query = supabase
      .from("jarvis_knowledge_items")
      .insert(payload)
      .select("*")
      .single();
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as KnowledgeItem;
}
