// src/lib/jarvis/knowledge/store.ts

import { createClient } from "@/lib/supabase/server";
import {
  UpsertKnowledgeItemInput,
  KnowledgeItem,
  KnowledgeModule,
} from "./types";

/**
 * Get a module by slug. If it doesn't exist, create it automatically.
 * This way, any new moduleSlug used in training data "just works".
 */
async function getOrCreateModuleBySlug(slug: string): Promise<KnowledgeModule> {
  const supabase = createClient();

  // 1) Try to find existing module
  const { data, error } = await supabase
    .from("jarvis_knowledge_modules")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Error loading knowledge module:", error.message);
    throw error;
  }

  if (data) {
    return data as KnowledgeModule;
  }

  // 2) Auto-create module if not found
  const prettyName =
    slug
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Jarvis Module";

  const { data: created, error: insertError } = await supabase
    .from("jarvis_knowledge_modules")
    .insert({
      slug,
      name: prettyName,
      description: `Auto-created module for slug "${slug}".`,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("Error creating knowledge module:", insertError.message);
    throw insertError;
  }

  return created as KnowledgeModule;
}

export async function upsertKnowledgeItem(
  input: UpsertKnowledgeItemInput
): Promise<KnowledgeItem> {
  const supabase = createClient();

  let module_id: string | null = null;

  if (input.moduleSlug) {
    const module = await getOrCreateModuleBySlug(input.moduleSlug);
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
