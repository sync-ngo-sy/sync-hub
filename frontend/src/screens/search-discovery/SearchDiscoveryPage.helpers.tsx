import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import type { SearchRequest } from "@/features/search/searchState";
import { deriveSearchFilters } from "@/lib/queryIntent";

import aiFilledIcon from "../../assets/ai_filled.svg";

type SearchLoadingStep = {
  label: string;
  phrase: string;
  detail: string;
};

const ROLE_LABELS: Record<string, string> = {
  backend: "backend",
  frontend: "frontend",
  "full-stack": "full-stack",
  mobile: "mobile",
  devops: "DevOps",
  data: "data",
  ml: "ML",
  qa: "QA",
  security: "security",
  generalist: "generalist",
};

function formatSearchList(values: string[], maxItems = 2) {
  const visible = values.slice(0, maxItems);
  const suffix = values.length > maxItems ? ` +${values.length - maxItems}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function compactSearchQuery(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 54 ? `${trimmed.slice(0, 51)}...` : trimmed;
}

function buildSearchLoadingSteps(request: SearchRequest): SearchLoadingStep[] {
  const inferredFilters = deriveSearchFilters(request.query, request.filters);
  const queryLabel = compactSearchQuery(request.query);
  const roleLabel = inferredFilters.role ? ROLE_LABELS[inferredFilters.role] ?? inferredFilters.role : null;
  const seniorityLabel = inferredFilters.seniority ? `${inferredFilters.seniority} ` : "";
  const rolePhrase = roleLabel ? `${seniorityLabel}${roleLabel}`.trim() : "matching";
  const skills = inferredFilters.skills ?? [];
  const companies = inferredFilters.companies ?? [];
  const minYears = inferredFilters.minYearsExperience ?? 0;
  const location = inferredFilters.location?.trim();
  const constraintParts = [
    minYears > 0 ? `${Math.round(minYears)}+ years` : null,
    location || null,
    skills.length ? formatSearchList(skills) : null,
    companies.length ? formatSearchList(companies) : null,
  ].filter((part): part is string => Boolean(part));

  const steps: SearchLoadingStep[] = [
    {
      label: "Read request",
      phrase: queryLabel ? `Asking the intent model to read "${queryLabel}"` : "Reading selected filters..",
      detail: roleLabel
        ? `Treating ${roleLabel} as the target role and keeping location separate.`
        : "Separating role, skills, seniority, years, companies, and location.",
    },
    {
      label: "Shape filters",
      phrase: constraintParts.length ? `Applying ${formatSearchList(constraintParts, 3)}` : `Looking for ${rolePhrase} candidates`,
      detail: constraintParts.length
        ? "Using the explicit constraints as hard filters before ranking."
        : "Keeping the search broad enough to avoid dropping relevant profiles too early.",
    },
  ];

  if (skills.length) {
    steps.push({
      label: "Check skills",
      phrase: `Checking ${formatSearchList(skills)} evidence`,
      detail: "Matching requested skills against normalized candidate skill tokens.",
    });
  }

  if (location) {
    steps.push({
      label: "Match location",
      phrase: `Filtering for ${location}`,
      detail: "Comparing candidate locations with the normalized location request.",
    });
  }

  steps.push(
    {
      label: "Scan profiles",
      phrase: `Scanning ${rolePhrase} profiles`,
      detail: "Looking at titles, profile summaries, experience, and indexed skills.",
    },
    {
      label: "Rank shortlist",
      phrase: "Balancing exact fit with semantic relevance",
      detail: "Prioritizing title evidence, role fit, seniority, experience, and match quality.",
    },
    {
      label: "Prepare results",
      phrase: "Preparing the first ranked profiles",
      detail: "Packaging the strongest candidates for the results list.",
    },
  );

  return steps;
}

export function SearchProcessingState({ request }: { request: SearchRequest }) {
  const steps = useMemo(() => buildSearchLoadingSteps(request), [request]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = steps[activeStepIndex] ?? steps[0];

  useEffect(() => {
    setActiveStepIndex(0);
    const stepTimer = window.setInterval(() => {
      setActiveStepIndex((currentIndex) => {
        if (currentIndex >= steps.length - 1) {
          window.clearInterval(stepTimer);
          return currentIndex;
        }
        return currentIndex + 1;
      });
    }, 1250);

    return () => {
      window.clearInterval(stepTimer);
    };
  }, [steps]);

  return (
    <div
      className="w-full bg-[#39393a] border border-[var(--border)] rounded-[var(--radius)] p-8 flex flex-col items-center gap-6"
      aria-busy="true"
      aria-label="Searching candidates"
    >
      {/* Visual: Icons + Spinner */}
      <div className="relative flex items-center justify-center w-20 h-20" aria-hidden="true">
        {/* Outer spinning ring */}
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            border: '2px solid transparent',
            borderTopColor: '#00857e',
            borderRightColor: '#00857e',
          }}
        />
        {/* Inner ring */}
        <div
          className="absolute rounded-full"
          style={{
            inset: '6px',
            border: '1px solid rgba(80, 193, 184, 0.15)',
          }}
        />
        {/* Orbiting Search icon */}
        <div
          className="absolute animate-spin"
          style={{
            width: '100%',
            height: '100%',
            animationDuration: '3s',
            animationDirection: 'reverse',
          }}
        >
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#39393a] border border-[var(--border)] flex items-center justify-center"
          >
            <Search size={11} className="text-[var(--primary)]" />
          </div>
        </div>
        {/* Orbiting Users icon */}
        <div
          className="absolute animate-spin"
          style={{
            width: '100%',
            height: '100%',
            animationDuration: '3s',
          }}
        >
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#39393a] border border-[var(--border)] flex items-center justify-center"
          >
            <Users size={11} className="text-[var(--text-soft)]" />
          </div>
        </div>
        {/* Core AI icon */}
        <div className="relative z-10 w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center">
          <img src={aiFilledIcon} alt="" width={20} height={20} style={{ display: "block", filter: "brightness(0) saturate(100%) invert(70%) sepia(40%) saturate(400%) hue-rotate(140deg)" }} />
        </div>
      </div>

      {/* Copy */}
      <div className="flex flex-col items-center gap-2 text-center max-w-md">
        <p className="text-lg font-semibold text-[var(--text)] m-0">AI Search In Progress</p>
        <p className="text-base text-[var(--primary)] m-0 font-medium min-h-[1.5rem] transition-all duration-500">
          {activeStep.phrase}
        </p>
        <p className="text-sm text-[var(--text-muted)] m-0 leading-relaxed transition-all duration-500">
          {activeStep.detail}
        </p>
      </div>

      {/* Steps */}
      <div className="flex flex-wrap items-center justify-center gap-2 w-full">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal transition-all duration-300 select-none"
            style={{
              background: index === activeStepIndex
                ? 'rgba(80, 193, 184, 0.15)'
                : index < activeStepIndex
                  ? 'rgba(80, 193, 184, 0.06)'
                  : 'rgba(80, 193, 184, 0.03)',
              color: index === activeStepIndex
                ? 'var(--primary)'
                : index < activeStepIndex
                  ? 'var(--text-soft)'
                  : 'var(--text-soft)',
              border: index === activeStepIndex
                ? '1px solid rgba(80, 193, 184, 0.3)'
                : '1px solid rgba(80, 193, 184, 0.08)',
              opacity: index > activeStepIndex ? 0.45 : 1,
            }}
          >
            {/* Dot indicator */}
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: index < activeStepIndex
                  ? 'var(--primary)'
                  : index === activeStepIndex
                    ? 'var(--primary)'
                    : 'var(--text-soft)',
                opacity: index < activeStepIndex ? 0.5 : 1,
              }}
            />
            {step.label}
          </div>
        ))}
      </div>
    </div>
  );
}
