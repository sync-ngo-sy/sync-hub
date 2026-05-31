import type { ParsingDocumentDetail } from "@/lib/contracts";
import type { TagTone } from "@/features/parsing/utils/parserProfiles";

export function parsingFieldTone(state: ParsingDocumentDetail["fieldCoverage"][number]["state"]): TagTone {
  if (state === "parsed") {
    return "success";
  }
  if (state === "partial") {
    return "warning";
  }
  return "warning";
}

export function formatParsingDateTime(value: string) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function canOpenOriginalDocument(detail: ParsingDocumentDetail) {
  return Boolean(detail.storagePath || (detail.sourceUri && /^(https?:)?\/\//i.test(detail.sourceUri)));
}
