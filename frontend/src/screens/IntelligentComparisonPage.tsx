import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { buildChatHref } from "@/lib/chatAgent";
import type { ComparisonResponse } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { ProgressBar, Tag } from "@/components/ui";
import { ArrowRight, ArrowLeft, Sparkles, ShieldCheck, AlertTriangle, GitCompareArrows, X } from "lucide-react";
import searchIcon from "../assets/search.svg";

export function IntelligentComparisonPage() {
  const {
    currentWorkspace,
    isPlatformAdmin,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();

  const [searchParams] = useSearchParams();
  const [skillInput, setSkillInput] = useState("");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [response, setResponse] = useState<ComparisonResponse | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const rawIds = searchParams.get("ids");
  const candidateIds = rawIds ? rawIds.split(",").map((item) => item.trim()).filter(Boolean) : [];
  const workspaceNameById = new Map(workspaceOptions.map((workspace) => [workspace.id, workspace.name]));

  useEffect(() => {
    if (candidateIds.length < 2) {
      setResponse(null);
      return;
    }

    let cancelled = false;
    setIsFetching(true);

    platformApi.compare(candidateIds, requiredSkills).then((nextResponse) => {
      if (!cancelled) {
        setResponse(nextResponse);
        setIsFetching(false);
      }
    }).catch(() => {
      if (!cancelled) setIsFetching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [candidateIds, requiredSkills]);

  function handleAddSkills(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const newSkills = skillInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (newSkills.length > 0) {
        setRequiredSkills((prev) => {
          const combined = [...prev, ...newSkills];
          return Array.from(new Set(combined)); // Deduplicate
        });
        setSkillInput("");
      }
    }
  }

  function handleRemoveSkill(skillToRemove: string) {
    setRequiredSkills((prev) => prev.filter((skill) => skill !== skillToRemove));
  }

  if (candidateIds.length < 2) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] p-4">
        <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-2xl w-full text-center flex flex-col items-center gap-6 shadow-[var(--shadow)]">
          <div className="w-16 h-16 rounded-full bg-[var(--border)] flex items-center justify-center">
            <GitCompareArrows size={24} className="text-[var(--text-muted)]" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text)] m-0">Compare Candidates Side-by-Side</h2>
          <p className="text-[15px] text-[var(--text-muted)] m-0">
            To generate an intelligent, side-by-side comparison, select at least two candidates from your search results or shortlist.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/search"
              className="group px-6 h-11 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center gap-2 select-none [--icon-filter:brightness(0)_saturate(100%)_invert(21%)_sepia(3%)_saturate(137%)_hue-rotate(201deg)] hover:[--icon-filter:brightness(0)_saturate(100%)_invert(100%)]"
            >
              <img
                src={searchIcon}
                alt="Search"
                width={16}
                height={16}
                className="shrink-0 transition-all duration-200"
                style={{ filter: "var(--icon-filter)" }}
              />
              Search
            </Link>
            <button
              type="button"
              disabled
              className="px-6 h-11 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--border)] text-[var(--text-muted)] opacity-35 cursor-not-allowed flex items-center gap-2 select-none"
            >
              Select from Shortlist
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isFetching && !response) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] p-4">
        <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-lg w-full text-center flex flex-col items-center gap-6 shadow-[var(--shadow)]">
          <div className="w-16 h-16 rounded-full bg-[var(--border)] flex items-center justify-center animate-pulse">
            <Sparkles size={24} className="text-[var(--primary)]" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text)] m-0">Preparing comparison</h2>
          <p className="text-[15px] text-[var(--text-muted)] m-0">
            Loading selected candidates and computing deterministic side-by-side scoring.
          </p>
        </div>
      </div>
    );
  }

  if (!response) return null;

  const recommendedItem = response.items.find((item) => item.candidateId === response.recommendedCandidateId);

  return (
    <div className="page-stack mx-auto px-4 py-8 flex flex-col gap-6">

      {/* Top Header & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link to="/search" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1.5 transition-colors mb-2 cursor-pointer">
            <ArrowLeft size={14} />
            Back to Search
          </Link>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <PlatformScopeControl
            isPlatformAdmin={isPlatformAdmin}
            scopeMode={scopeMode}
            onChangeScopeMode={setScopeMode}
            currentWorkspace={currentWorkspace}
            workspaceOptions={workspaceOptions}
            onChangeWorkspace={setWorkspaceId}
          />
        </div>
      </div>

      {/* Required Skills Filter */}
      <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-5 flex flex-col md:flex-row items-center md:items-end gap-4 shadow-[var(--shadow)]">
        <div className="flex-1 flex flex-col gap-2.5 w-full md:w-auto">
          <span className="text-xs font-semibold uppercase tracking-wider mb-2 text-[var(--text-soft)] pl-2">Required skills for this comparison</span>
          <div className="flex flex-wrap items-center gap-2 min-h-[44px] bg-[var(--border)] rounded-full pl-4 pr-4 py-1.5 border border-transparent focus-within:border-[var(--primary)]/40 focus-within:ring-2 focus-within:ring-[var(--primary)]/20 transition-all">
            <img
              src={searchIcon}
              alt=""
              width={16}
              height={16}
              className="shrink-0 opacity-70"
            />
            {requiredSkills.map((skill) => (
              <div
                key={skill}
                className="flex items-center gap-1 bg-[var(--border-strong)] text-[var(--text)] text-xs font-semibold pl-2.5 pr-1.5 py-1 rounded-full"
              >
                <span>{skill}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(skill)}
                  className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors outline-none border-0 cursor-pointer p-0"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <input
              className="flex-1 bg-transparent outline-none border-none focus:outline-none focus:ring-0 w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-8 min-w-[100px]"
              placeholder={requiredSkills.length === 0 ? "e.g. React, Node.js (Press Enter)" : "Add skill..."}
              value={skillInput}
              onChange={(e) => {
                const capitalized = e.target.value.replace(/(^\w|\s\w)/g, (match) => match.toUpperCase());
                setSkillInput(capitalized);
              }}
              onKeyDown={handleAddSkills}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 h-11">
          {response.source === "cached_artifact" && (
            <Tag tone="primary">Cached Result</Tag>
          )}
          <Link
            to={buildChatHref(candidateIds, "Which candidate is the strongest overall fit and why?")}
            className="px-5 h-11 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center gap-2 select-none"
          >
            <Sparkles size={16} />
            Ask SYNC AI
          </Link>
        </div>
      </div>

      {/* Recommended Candidate Banner */}
      {recommendedItem && (
        <div className="bg-[var(--primary)] border border-transparent rounded-[var(--radius,22px)] p-5 shadow-[var(--shadow)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={24} className="text-[#39393a]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#39393a]/70">Recommended Candidate</span>
              <h3 className="text-lg font-bold text-[#39393a] m-0 leading-tight">{recommendedItem.name}</h3>
              <span className="text-sm text-[#39393a]/80">{recommendedItem.currentTitle} · Score: {recommendedItem.score}</span>
              <span className="text-[13px] text-[#39393a]/60 leading-snug mt-1">
                AI recommendation based on current data. Does not replace evaluating and interviewing all shortlisted candidates.
              </span>
            </div>
          </div>
          <Link
            to={`/dossier/${recommendedItem.candidateId}`}
            className="px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[#39393a] text-white hover:bg-[#39393a]/80 cursor-pointer transition-colors duration-200 flex items-center gap-2 select-none flex-shrink-0"
          >
            View Dossier <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {/* Main Comparison Grid */}
      <div className={`grid gap-4 ${
        response.items.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      }`}>
        {response.items.map((item) => {
          const isRecommended = item.candidateId === response.recommendedCandidateId;

          return (
            <div
              key={item.candidateId}
              className={`bg-[#39393a] border rounded-[var(--radius,22px)] overflow-hidden flex flex-col shadow-[var(--shadow)] transition-all duration-200 hover:shadow-lg ${
                isRecommended ? "border-[var(--primary)]" : "border-[var(--border)] hover:border-[var(--border-strong)]"
              }`}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-[var(--border)] flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-[var(--text)] truncate">{item.name}</span>
                    {isRecommended && <Tag tone="primary">Top</Tag>}
                  </div>
                  <span className="text-[13px] text-[var(--text-muted)] truncate">{item.currentTitle}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {item.tenantId ? <Tag>{workspaceNameById.get(item.tenantId) ?? "Workspace"}</Tag> : null}
                    <Tag tone="primary">{item.seniority.charAt(0).toUpperCase() + item.seniority.slice(1)}</Tag>
                    <Tag>{formatYearsExperience(item.yearsExperience)}</Tag>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-0.5 flex-shrink-0 bg-[var(--border)] px-3 py-1.5 rounded-xl">
                  <span className="text-xl font-bold text-[var(--text)] leading-tight">{item.score}</span>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Composite</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 flex flex-col gap-4 flex-1">
                {/* Matched Skills */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Matched Skills</span>
                    <span className="text-sm font-bold text-[var(--text)]">{item.matchedSkills.length}</span>
                  </div>
                  <ProgressBar value={Math.min(100, item.matchedSkills.length * 24 + 20)} />
                </div>

                {/* Summary */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Summary</span>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed m-0 line-clamp-3">{item.summary}</p>
                </div>

                {/* Strengths */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Strengths</span>
                  <ul className="m-0 p-0 flex flex-col gap-1">
                    {item.strengths.slice(0, 2).map((strength) => (
                      <li key={strength} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                        <ShieldCheck size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Gaps */}
                <div className="flex flex-col gap-1.5 mt-auto">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Gaps</span>
                  {item.gaps.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.gaps.map((gap) => (
                        <Tag key={gap} tone="warning">
                          <AlertTriangle size={12} className="mr-1" />
                          {gap}
                        </Tag>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-[var(--text-muted)]">No explicit gaps for selected skills</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Overlap & Decision Support */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Overlap */}
        <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-6 shadow-[var(--shadow)] flex flex-col gap-4">
          <h3 className="text-lg font-bold text-[var(--text)] m-0">Shared Overlap</h3>
          {response.overlap.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {response.overlap.map((skill) => (
                <Tag key={skill} tone="primary">
                  {skill.charAt(0).toUpperCase() + skill.slice(1)}
                </Tag>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] m-0">No overlapping skills found across all selected candidates.</p>
          )}
          <p className="text-xs text-[var(--text-soft)] m-0 mt-auto pt-2 border-t border-[var(--border)]">
            Overlap is derived from structured skills and cached summaries, then presented as reusable recruiter-facing evidence.
          </p>
        </div>

        {/* Decision Support */}
        <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-6 shadow-[var(--shadow)] flex flex-col gap-4">
          <h3 className="text-lg font-bold text-[var(--text)] m-0">Decision Support</h3>
          <p className="text-sm text-[var(--text-muted)] m-0 leading-relaxed">
            The comparison API can return cached artifacts when they exist. This frontend also handles deterministic fallback payloads from the current Supabase function.
          </p>

          {response.recommendedCandidateId && (
            <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-[var(--border)]">
              <Link
                to={`/dossier/${response.recommendedCandidateId}`}
                className="px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center gap-1.5 select-none"
              >
                Open Recommended Dossier <ArrowRight size={16} />
              </Link>
              <Link
                to={buildChatHref(candidateIds, "What are the main risks or gaps across this shortlist?")}
                className="px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center gap-1.5 select-none"
              >
                <Sparkles size={16} />
                Ask Agent
              </Link>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
