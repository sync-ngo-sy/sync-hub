import { startTransition, useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Clock3, MapPin, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { defaultSearchQuery } from "@/data/mockData";
import type { SearchFilters, SearchResponse } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { deriveSearchFilters, parseSkillText } from "@/lib/queryIntent";
import { Avatar, EmptyState, PageIntro, Panel, ProgressBar, ScorePill, Tag } from "@/components/ui";

type SearchRequest = {
  query: string;
  filters: SearchFilters;
  submittedAt: number;
};

export function SearchDiscoveryPage() {
  const [query, setQuery] = useState(defaultSearchQuery);
  const [role, setRole] = useState("");
  const [seniority, setSeniority] = useState("");
  const [minYears, setMinYears] = useState(0);
  const [location, setLocation] = useState("");
  const [skillText, setSkillText] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<SearchRequest>(() => ({
    query: defaultSearchQuery,
    filters: buildFilters({
      role: "",
      seniority: "",
      minYears: 0,
      location: "",
      skillText: "",
    }),
    submittedAt: Date.now(),
  }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    platformApi
      .search(request.query, request.filters)
      .then((nextResponse) => {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setResponse(nextResponse);
          setLoading(false);
        });
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        setError(String(nextError));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  function handleExecute() {
    const derivedFilters = deriveSearchFilters(query, {
      role,
      seniority,
      minYearsExperience: minYears,
      location,
      skills: parseSkillText(skillText),
    });

    if (!role && derivedFilters.role) {
      setRole(derivedFilters.role);
    }
    if (!seniority && derivedFilters.seniority) {
      setSeniority(derivedFilters.seniority);
    }
    if (minYears === 0 && (derivedFilters.minYearsExperience ?? 0) > 0) {
      setMinYears(derivedFilters.minYearsExperience ?? 0);
    }
    if (!skillText.trim() && (derivedFilters.skills?.length ?? 0) > 0) {
      setSkillText((derivedFilters.skills ?? []).join(", "));
    }

    setRequest({
      query,
      filters: derivedFilters,
      submittedAt: Date.now(),
    });
  }

  const compareHref =
    response && response.results.length >= 2
      ? `/compare?ids=${response.results
          .slice(0, 2)
          .map((candidate) => candidate.candidateId)
          .join(",")}`
      : "/compare";

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Retrieval-first workflow"
        title="Discover talent. Synthesize fit."
        description="Use natural language plus structured filters to retrieve evidence-backed candidates. Results stay grounded in chunk-level signals and recruiter-friendly score diagnostics."
        actions={
          <div className="skill-list">
            <Link className="button button--secondary" to="/search-config">
              Tune Search
            </Link>
            <Link className="button button--primary" to={compareHref}>
              Compare Top Matches
              <ArrowRight size={16} />
            </Link>
          </div>
        }
      />

      <form
        className="hero-grid"
        onSubmit={(event) => {
          event.preventDefault();
          handleExecute();
        }}
      >
        <Panel className="hero-panel">
          <div className="hero-panel__glow" />
          <div className="stack">
            <Tag tone="primary">Rank version {response?.meta.rankVersion ?? "v1"}</Tag>
            <h2>Natural language search over dossiers, chunks, and profile signals.</h2>
            <p>
              The online layer is retrieval-first: structured filters reduce the candidate pool, then evidence-driven ranking surfaces the strongest profiles with clear reasons.
            </p>
          </div>

          <div className="search-toolbar">
            <div className="search-input">
              <Sparkles size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find senior backend engineers with Node.js and GraphQL..." />
            </div>
            <button className="button button--primary" type="submit" disabled={loading}>
              <Search size={16} />
              {loading ? "Searching..." : "Execute"}
            </button>
          </div>
        </Panel>

        <Panel className="filters-panel">
          <div className="panel__section">
            <span className="eyebrow">Structured filters</span>
            <p>Separate deterministic narrowing from semantic retrieval so the ranking layer stays explainable.</p>
          </div>

          <label className="panel__section">
            <span>Role</span>
            <select className="form-select" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">Any</option>
              <option value="backend">Backend</option>
              <option value="full-stack">Full-Stack</option>
              <option value="ml">ML / Search</option>
            </select>
          </label>

          <label className="panel__section">
            <span>Seniority</span>
            <select className="form-select" value={seniority} onChange={(event) => setSeniority(event.target.value)}>
              <option value="">Any</option>
              <option value="senior">Senior</option>
              <option value="staff-plus">Staff</option>
            </select>
          </label>

          <label className="panel__section">
            <span>Minimum experience</span>
            <input className="form-input" type="number" value={minYears} min={0} onChange={(event) => setMinYears(Number(event.target.value))} />
          </label>

          <label className="panel__section">
            <span>Location hint</span>
            <input className="form-input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional city or region" />
          </label>

          <label className="panel__section">
            <span>Skills</span>
            <input className="form-input" value={skillText} onChange={(event) => setSkillText(event.target.value)} placeholder="Node.js, GraphQL, PostgreSQL" />
          </label>
        </Panel>
      </form>

      {loading ? (
        <EmptyState title="Searching candidates" detail="Applying structured filters, then ranking the candidate pool against semantic and skill signals." />
      ) : error ? (
        <EmptyState title="Search failed" detail={error} />
      ) : !response?.results.length ? (
        <EmptyState
          title="No candidates found"
          detail="The search ran successfully, but there are no indexed candidates matching the current query and filters yet."
        />
      ) : (
        <div className="candidate-results">
          {response?.results.map((candidate) => {
            const partnerId =
              response.results.find((item) => item.candidateId !== candidate.candidateId)?.candidateId ?? candidate.candidateId;

            return (
              <Panel key={candidate.candidateId} className="candidate-card">
                <div className="candidate-card__header">
                  <div className="candidate-card__identity">
                    <Avatar name={candidate.name} hue={candidate.avatarHue} />
                    <div className="stack">
                      <h3>{candidate.name}</h3>
                      <p>{candidate.currentTitle}</p>
                      <div className="skill-list">
                        <Tag>{candidate.seniority}</Tag>
                        <Tag>{candidate.primaryRole}</Tag>
                        <Tag tone="success">{candidate.stage}</Tag>
                      </div>
                    </div>
                  </div>
                  <ScorePill score={candidate.matchScore} />
                </div>

                <div className="meta-list">
                  <span className="tag">
                    <MapPin size={14} />
                    {candidate.location}
                  </span>
                  <span className="tag">
                    <BriefcaseBusiness size={14} />
                    {candidate.yearsExperience} years
                  </span>
                  <span className="tag">
                    <Clock3 size={14} />
                    {candidate.availability}
                  </span>
                </div>

                <p>{candidate.shortSummary}</p>

                <div className="signal-list">
                  <div className="signal-row">
                    <strong>Semantic alignment</strong>
                    <span>{Math.round(candidate.matchSignals.semantic * 100)}%</span>
                  </div>
                  <ProgressBar value={candidate.matchSignals.semantic * 100} />

                  <div className="signal-row">
                    <strong>Skill overlap</strong>
                    <span>{Math.round(candidate.matchSignals.skill * 100)}%</span>
                  </div>
                  <ProgressBar value={candidate.matchSignals.skill * 100} tone="secondary" />

                  <div className="signal-row">
                    <strong>Experience match</strong>
                    <span>{Math.round(candidate.matchSignals.experience * 100)}%</span>
                  </div>
                  <ProgressBar value={candidate.matchSignals.experience * 100} tone="tertiary" />
                </div>

                <div className="skill-list">
                  {candidate.topSkills.slice(0, 5).map((skill) => (
                    <Tag key={skill} tone="primary">
                      {skill}
                    </Tag>
                  ))}
                </div>

                <div className="quote">{candidate.matchNarrative}</div>

                <div className="skill-list">
                  <Link className="button button--secondary" to={`/dossier/${candidate.candidateId}`}>
                    View Dossier
                  </Link>
                  <Link className="button button--primary" to={`/compare?ids=${candidate.candidateId},${partnerId}`}>
                    Compare
                  </Link>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildFilters({
  role,
  seniority,
  minYears,
  location,
  skillText,
}: {
  role: string;
  seniority: string;
  minYears: number;
  location: string;
  skillText: string;
}): SearchFilters {
  return deriveSearchFilters("", {
    role,
    seniority,
    minYearsExperience: minYears,
    location,
    skills: parseSkillText(skillText),
  });
}
