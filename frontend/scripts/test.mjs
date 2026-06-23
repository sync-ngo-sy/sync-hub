import assert from "node:assert/strict";
import path from "node:path";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");

const testSource = `
  import assert from "node:assert/strict";
  import { deriveSearchFilters, parseSkillText } from "./src/lib/queryIntent.ts";
  import { formatYearsExperience } from "./src/lib/experience.ts";
  import { normalizeLocationValue, normalizeSeniorityValue } from "./src/lib/searchTaxonomy.ts";
  import { buildChatHref, parseChatCandidateIds } from "./src/lib/chatAgent.ts";
  import { emptyJobForm, jobInputFromForm, splitList, validateJobForm } from "./src/features/jobs/jobForm.ts";
  import { shortlistKey } from "./src/features/search/searchState.ts";

  assert.deepEqual(parseSkillText("python, React; postgres"), ["Python", "React", "PostgreSQL"]);

  assert.deepEqual(
    deriveSearchFilters("senior backend engineer in Dubai", {
      role: "backend",
      seniority: "sr.",
      minYearsExperience: 5,
      skills: ["py", "reactjs", "py"],
      companies: ["Acme", " Acme ", "Globex"],
      location: "Dubai",
    }),
    {
      role: "backend",
      seniority: "senior",
      minYearsExperience: 5,
      location: "United Arab Emirates",
      skills: ["Python", "React"],
      companies: ["Acme", "Globex"],
    },
  );

  assert.equal(normalizeLocationValue("Berlin, Germany"), "Germany");
  assert.equal(normalizeSeniorityValue("principal"), "staff-plus");
  assert.equal(formatYearsExperience(1), "1 year");
  assert.equal(formatYearsExperience(2.4, "yrs"), "2 yrs");

  assert.deepEqual(parseChatCandidateIds(" c1, c2, c1 ,, "), ["c1", "c2"]);
  assert.equal(buildChatHref(["c1", " c2 ", "c1"], "  Why this fit? "), "/chat?ids=c1%2Cc2&q=Why+this+fit%3F");
  assert.equal(shortlistKey("tenant-1", "candidate-7"), "tenant-1:candidate-7");

  const draftJob = emptyJobForm("tenant-1");
  assert.deepEqual(validateJobForm(draftJob, "draft"), ["title", "employer name", "employer country", "job description"]);
  assert.deepEqual(splitList("React, TypeScript; Node\\nPostgres"), ["React", "TypeScript", "Node", "Postgres"]);

  const activeJob = {
    ...draftJob,
    title: "Senior React Engineer",
    employerName: "Acme",
    employerCountry: "UAE",
    jobDescription: "Build internal talent intelligence workflows.",
    requiredSkills: "React, TypeScript, React",
    preferredSkills: "Node, React",
    seniorityLevel: "Senior",
    employmentType: "Full-time",
  };
  assert.deepEqual(validateJobForm(activeJob, "active"), []);
  assert.deepEqual(jobInputFromForm(activeJob, "active").preferredSkills, ["Node"]);
`;

const result = await build({
  stdin: {
    contents: testSource,
    loader: "ts",
    resolveDir: frontendDir,
    sourcefile: "frontend-unit-tests.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  absWorkingDir: frontendDir,
  loader: {
    ".png": "dataurl",
    ".svg": "text",
  },
  alias: {
    "@": path.join(frontendDir, "src"),
  },
});

const code = result.outputFiles[0].text;
const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
await import(url);

assert.ok(true);
console.log("Frontend unit smoke tests passed.");
