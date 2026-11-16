import type { Character } from "./character-types";

export type KnowledgeRule = {
  mode: "brief" | "full" | "custom";
  trigger: "always" | "keywords" | "off";
  keywords: string;
  customText: string;
};
export const DEFAULT_KNOWLEDGE_RULE: KnowledgeRule = { mode: "brief", trigger: "always", keywords: "", customText: "" };
export function knowledgeKey(viewerId: string, subjectId: string): string { return `${viewerId}::${subjectId}`; }
export function renderKnownCharacter(subject: Character, rule: KnowledgeRule | undefined, context: string): string {
  const settings = { ...DEFAULT_KNOWLEDGE_RULE, ...rule };
  if (settings.trigger === "off") return "";
  if (settings.trigger === "keywords") {
    const keys = settings.keywords.split(/[,，、;；\n]/).map(key => key.trim().toLocaleLowerCase()).filter(Boolean);
    if (!keys.length || !keys.some(key => context.toLocaleLowerCase().includes(key))) return "";
  }
  if (settings.mode === "full") return [subject.persona, subject.personality ? `性格：${subject.personality}` : ""].filter(Boolean).join("\n\n").trim();
  if (settings.mode === "custom") return settings.customText.trim();
  return subject.briefPersona?.trim() || "";
}

