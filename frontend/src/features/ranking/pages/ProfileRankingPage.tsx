import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Award, ChevronDown, ChevronUp, RefreshCw, SlidersHorizontal } from "lucide-react";
import { EmptyState, PageIntro, Panel, ScorePill, Tag } from "@/components/ui";
import { PickerDropdown } from "@/components/PickerDropdown";
import { useAuth } from "@/lib/auth";
import { usePlatformScope } from "@/lib/platformScope";
import { rankingApi } from "@/features/ranking/api";
import { RankingBreakdown } from "@/features/ranking/components/RankingBreakdown";

const SENIORITY_OPTIONS = ["", "junior", "mid", "senior", "staff-plus"];
const PAGE_SIZE = 25;

/** Qualitative reading of the score so the number is stated only once. */
function fitLabel(percent: number) {
  if (percent >= 90) return "Excellent fit";
  if (percent >= 75) return "Strong fit";
  if (percent >= 60) return "Good fit";
  if (percent >= 40) return "Fair fit";
  return "Weak fit";
}

export function ProfileRankingPage() {
  const { currentTenant, isAdmin } = useAuth();
  const { resolvedTenantIds, currentWorkspace } = usePlatformScope();
  const tenantId = currentTenant?.id ?? currentWorkspace?.id ?? "";

  const [targetFamily, setTargetFamily] = useState<string>("software-engineering");
  const [query, setQuery] = useState("");
  const [seniority, setSeniority] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const canManage = Boolean(
    isAdmin || (currentTenant && ["owner", "admin"].includes(currentTenant.role)),
  );

  const optionsQuery = useQuery({
    queryKey: ["ranking-target-options", resolvedTenantIds],
    queryFn: () => rankingApi.targetOptions(resolvedTenantIds),
    enabled: resolvedTenantIds.length > 0,
  });

  // Stored per-family scores refresh themselves: silently recompute whenever
  // an admin opens this page (they also refresh on every formula publish).
  useEffect(() => {
    if (canManage && tenantId) {
      rankingApi.recomputeScores(tenantId).catch(() => {});
    }
  }, [canManage, tenantId]);

  const target = useMemo(() => ({ job_family: targetFamily }), [targetFamily]);

  // Only candidates with target-relevant experience are shown.
  const filters = useMemo(
    () => ({ query, seniority: seniority || null, min_score: minScore, relevant_only: true }),
    [query, seniority, minScore],
  );

  const rankQuery = useQuery({
    queryKey: ["ranking-profiles", resolvedTenantIds, tenantId, target, filters, page],
    queryFn: () =>
      rankingApi.rankProfiles({
        tenantIds: resolvedTenantIds,
        tenantId,
        target,
        filters,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: resolvedTenantIds.length > 0 && Boolean(tenantId),
    placeholderData: keepPreviousData,
  });

  const data = rankQuery.data;
  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function toggleExpanded(candidateId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }

  function resetPageAnd(action: () => void) {
    action();
    setPage(0);
  }

  const families = optionsQuery.data?.families ?? [];

  return (
    <div className="page-stack ranking-page">
      <PageIntro
        eyebrow="Talent"
        title="Profile Ranking"
        description="Rules-based scoring of every profile against the criteria that matter for a role. Each score is fully explainable — expand a row to see the per-criterion breakdown."
        actions={
          canManage ? (
            <Link className="button button--secondary" to="/ranking/formula">
              <SlidersHorizontal size={14} />
              Configure formula
            </Link>
          ) : undefined
        }
      />

      <Panel className="ranking-controls">
        <div className="ranking-controls__row">
          <div className="ranking-control">
            <span className="ranking-control__label">Job family</span>
            <PickerDropdown
              value={targetFamily}
              options={families.map((family) => ({ value: family.key, label: family.label }))}
              onChange={(value) => resetPageAnd(() => setTargetFamily(value))}
              placeholder="Select a family"
              allowEmpty={false}
            />
          </div>

          <label className="ranking-control">
            <span className="ranking-control__label">Search name / title</span>
            <input
              className="form-input"
              value={query}
              placeholder="e.g. Ahmad, backend"
              onChange={(event) => resetPageAnd(() => setQuery(event.target.value))}
            />
          </label>

          <div className="ranking-control">
            <span className="ranking-control__label">Seniority</span>
            <PickerDropdown
              value={seniority}
              options={SENIORITY_OPTIONS.filter(Boolean).map((option) => ({
                value: option,
                label: option.charAt(0).toUpperCase() + option.slice(1),
              }))}
              onChange={(value) => resetPageAnd(() => setSeniority(value))}
              placeholder="Any"
            />
          </div>

          <label className="ranking-control">
            <span className="ranking-control__label">Min score: {minScore}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(event) => resetPageAnd(() => setMinScore(Number(event.target.value)))}
            />
          </label>

        </div>

        {data ? (
          <div className="ranking-controls__meta">
            <Tag tone="neutral">{data.total} ranked</Tag>
            <Tag tone="neutral">Pool: {data.poolSize}</Tag>
            <Tag tone="primary">Target: {data.target.label}</Tag>
            <Tag tone={data.formula.usingDefault ? "warning" : "success"}>
              {data.formula.usingDefault ? "Default formula" : `Formula ${data.formula.version}`}
            </Tag>
          </div>
        ) : null}
      </Panel>

      {rankQuery.isError ? (
        <Panel className="table-card">
          <EmptyState
            title="Unable to rank profiles"
            detail={rankQuery.error instanceof Error ? rankQuery.error.message : "The ranking request failed."}
            action={
              <button className="button button--secondary" type="button" onClick={() => rankQuery.refetch()}>
                <RefreshCw size={14} />
                Retry
              </button>
            }
          />
        </Panel>
      ) : rankQuery.isLoading ? (
        <Panel className="table-card">
          <p>Scoring profiles…</p>
        </Panel>
      ) : items.length === 0 ? (
        <Panel className="table-card">
          <EmptyState
            title="No profiles match"
            detail="No candidates in this workspace match the current target and filters. Ingest CVs or relax the filters."
          />
        </Panel>
      ) : (
        <Panel className="table-card ranking-results">
          <ul className="ranking-list">
            {items.map((item) => {
              const isOpen = expanded.has(item.candidateId);
              return (
                <li key={item.candidateId} className="ranking-item">
                  <div className="ranking-item__main">
                    <span className="ranking-item__rank">#{item.rank}</span>
                    <div className="ranking-item__identity">
                      <Link to={`/dossier/${item.candidateId}`} className="ranking-item__name">
                        {item.name}
                      </Link>
                      <span className="ranking-item__sub">
                        {item.currentTitle ?? "—"}
                        {item.location ? ` · ${item.location}` : ""}
                        {typeof item.yearsExperience === "number" ? ` · ${item.yearsExperience} yrs` : ""}
                      </span>
                      <div className="ranking-item__tags">
                        <Tag tone="neutral">{item.jobFamilyLabel}</Tag>
                        {item.seniority ? <Tag tone="neutral">{item.seniority}</Tag> : null}
                        {item.recognitions.map((recognition) => (
                          <Tag key={recognition} tone="success">
                            <Award size={11} /> {recognition}
                          </Tag>
                        ))}
                      </div>
                    </div>
                    <div className="ranking-item__score">
                      <ScorePill score={item.percent} label={fitLabel(item.percent)} />
                    </div>
                    <button
                      type="button"
                      className="ranking-item__toggle ranking-item__toggle--icon"
                      onClick={() => toggleExpanded(item.candidateId)}
                      aria-expanded={isOpen}
                      aria-label="Toggle score breakdown"
                      title="Score breakdown"
                    >
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                  {isOpen ? <RankingBreakdown criteria={item.breakdown} /> : null}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <div className="ranking-pagination">
              <button
                className="button button--secondary"
                type="button"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {page + 1} of {totalPages}
              </span>
              <button
                className="button button--secondary"
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
