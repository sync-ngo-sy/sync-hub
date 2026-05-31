import type { ParserProfile, ParserProfileInput } from "@/lib/contracts";

export const EXTRACTION_PROVIDERS = [
  { value: "openai-compatible", label: "OpenAI-compatible" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
];

export const EMBEDDING_PROVIDERS = [
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "deterministic", label: "Deterministic fallback" },
];

export const CHUNKING_PROFILES = [
  { value: "standard", label: "Standard" },
  { value: "section-first", label: "Section-first" },
  { value: "dense-experience", label: "Dense experience" },
];

export type TagTone = "primary" | "neutral" | "success" | "warning";

export function createDefaultProfile(seed?: ParserProfile | null): ParserProfileInput {
  return {
    id: seed?.id,
    name: seed?.name ?? "New parser draft",
    slug: seed?.slug ?? "new-parser-draft",
    description: seed?.description ?? "",
    extractionProvider: seed?.extractionProvider ?? "openai-compatible",
    extractionModel: seed?.extractionModel ?? "gemini-2.5-flash",
    parserVersion: seed?.parserVersion ?? "pdftotext-raw-v2",
    modelVersion: seed?.modelVersion ?? "gemini-2.5-flash-v1",
    promptVersion: seed?.promptVersion ?? "openai-json-v1",
    chunkVersion: seed?.chunkVersion ?? "section-first-v1",
    embeddingProvider: seed?.embeddingProvider ?? "openai",
    embeddingModel: seed?.embeddingModel ?? "gemini-embedding-001",
    embeddingVersion: seed?.embeddingVersion ?? "gemini-embedding-001-768-v1",
    chunkingProfile: seed?.chunkingProfile ?? "section-first",
    ocrEnabled: seed?.ocrEnabled ?? false,
    allowHeuristicFallback: false,
    promptTemplate:
      seed?.promptTemplate ??
      [
        "You are extracting a recruiter-ready candidate profile from a CV.",
        "Return valid JSON only.",
        "Preserve evidence-backed skills, companies, dates, and contact details.",
        "Do not invent missing facts.",
      ].join("\n"),
    notes: seed?.notes ?? "",
  };
}

export function slugifyProfile(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 48);
}

export function parserProfileStatusTone(status: ParserProfile["status"]): TagTone {
  if (status === "active") {
    return "success";
  }
  if (status === "draft") {
    return "primary";
  }
  return "warning";
}
