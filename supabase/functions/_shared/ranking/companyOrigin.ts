// Heuristic Syrian / non-Syrian company detection for the "experience with
// international companies" criterion. Company nationality is not stored, so we
// derive it best-effort from the work-history location plus an admin-editable
// list of known Syrian employers. Unknown origins are NOT counted as
// international (conservative), and are flagged in the score evidence.

import { normalizeLocationValue } from "../searchTaxonomy.ts";

const SYRIA_TEXT_PATTERN =
  /\b(syria|syrian|damascus|damscus|aleppo|homs|latakia|lattakia|tartus|hama|deir ez-?zor|azaz)\b/i;

// Countries / major cities not covered by the search taxonomy's country list.
// Any match here is treated as a recognised non-Syrian location.
const EXTRA_NON_SYRIAN_PATTERN =
  /\b(malaysia|kuala lumpur|singapore|indonesia|jakarta|china|beijing|shanghai|japan|tokyo|south korea|seoul|hong kong|thailand|bangkok|vietnam|australia|sydney|melbourne|new zealand|spain|madrid|barcelona|italy|rome|milan|sweden|stockholm|norway|oslo|denmark|copenhagen|finland|switzerland|zurich|austria|vienna|belgium|brussels|ireland|dublin|portugal|lisbon|poland|romania|greece|athens|brazil|sao paulo|mexico|argentina|morocco|casablanca|tunisia|tunis|algeria|libya|sudan|yemen|cyprus|malta|estonia|czech|hungary|ukraine|russia|moscow)\b/i;

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type CompanyOrigin = "syrian" | "non-syrian" | "unknown";

export function classifyCompanyOrigin(
  company: string,
  location: string | null,
  description: string | null,
  syrianCompanyList: string[] = [],
): { origin: CompanyOrigin; country: string | null } {
  const companyNorm = normalize(company);

  // 1. Explicit admin-maintained Syrian employer list.
  for (const known of syrianCompanyList) {
    const knownNorm = normalize(known);
    if (knownNorm && companyNorm && companyNorm.includes(knownNorm)) {
      return { origin: "syrian", country: "Syria" };
    }
  }

  // 2. Recognised country from the role location.
  const country = location
    ? normalizeLocationValue(location, { allowFallback: false }) ?? null
    : null;
  if (country === "Syria") {
    return { origin: "syrian", country };
  }
  if (country) {
    return { origin: "non-syrian", country };
  }

  // 3. Free-text location mention in the role location / company / description.
  const haystack = `${company} ${location ?? ""} ${description ?? ""}`;
  if (SYRIA_TEXT_PATTERN.test(haystack)) {
    return { origin: "syrian", country: "Syria" };
  }
  const extra = location ? location.match(EXTRA_NON_SYRIAN_PATTERN) : null;
  if (extra) {
    return { origin: "non-syrian", country: extra[0] };
  }

  return { origin: "unknown", country: null };
}
