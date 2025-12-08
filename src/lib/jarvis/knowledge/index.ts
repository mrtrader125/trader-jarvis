// /lib/jarvis/knowledge/types.ts

export type KnowledgeItemType =
  | "rule"
  | "concept"
  | "formula"
  | "story"
  | "checklist";

export type KnowledgeStatus = "active" | "draft" | "archived";

export interface KnowledgeModule {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface KnowledgeItem {
  id: string;
  module_id: string | null;
  title: string;
  content_markdown: string;
  jarvis_instructions?: string | null;
  item_type: KnowledgeItemType;
  tags: string[];
  importance: number; // 1–5
  status: KnowledgeStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertKnowledgeItemInput {
  id?: string; // if present -> update, else create
  moduleSlug?: string; // e.g. 'trading_psychology'
  title: string;
  content_markdown: string;
  jarvis_instructions?: string;
  item_type?: KnowledgeItemType;
  tags?: string[];
  importance?: number;
  status?: KnowledgeStatus;
}

export interface KnowledgeContextBlock {
  title: string;
  item_type: KnowledgeItemType;
  importance: number;
  content: string;            // cleaned markdown
  instructions?: string;      // how Jarvis should use this
}
