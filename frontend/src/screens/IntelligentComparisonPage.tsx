import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ComparisonResponse } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { EmptyState, PageIntro, Panel, ProgressBar, Tag } from "@/components/ui";

export function IntelligentComparisonPage() {
  const [searchParams] = useSearchParams();
  const [requiredSkills, setRequiredSkills] = useState("");
  const [response, setResponse] = useState<ComparisonResponse | null>(null);
  const rawIds = searchParams.get("ids");
  const candidateIds = rawIds ? rawIds.split(",").map((item) => item.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (candidateIds.length < 2) {
      setResponse(null);
      return;
    }

    let cancelled = false;
    const skills = requiredSkills
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    platformApi.compare(candidateIds, skills).then((nextResponse) => {
      if (!cancelled) {
        setResponse(nextResponse);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [candidateIds, requiredSkills]);

  if (candidateIds.length < 2) {
    return (
      <EmptyState
        title="Select candidates to compare"
        detail="Open the comparison view from search results after selecting at least two real candidates."
        action={
          <Link className="button button--primary" to="/search">
            Back to search
          </Link>
        }
      />
    );
  }

  if (!response) {
    return <EmptyState title="Preparing comparison" detail="Loading selected candidates and computing deterministic side-by-side scoring." />;
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Bounded reasoning"
        title="Intelligent comparison"
        description="Compare shortlisted candidates side by side with explicit overlap, required-skill gaps, and grounded summary text. This view is designed for decision support, not open-ended chat."
        actions={<Link className="button button--secondary" to="/search">Back to search</Link>}
      />

      <Panel className="hero-panel">
        <div className="stack">
          <Tag tone="primary">{response.source}</Tag>
          <h2>Recommended candidate</h2>
          <p>
            {response.items.find((item) => item.candidateId === response.recommendedCandidateId)?.name ?? "No recommendation"} currently ranks first against the selected comparison frame.
          </p>
        </div>

        <div className="panel__section" style={{ marginTop: 24 }}>
          <span>Required skills for this comparison</span>
          <input className="form-input" value={requiredSkills} onChange={(event) => setRequiredSkills(event.target.value)} />
        </div>
      </Panel>

      <div className="comparison-grid">
        {response.items.map((item, index) => (
          <Panel key={item.candidateId} className="comparison-card">
            <div className={index === 0 ? "comparison-card__accent" : "comparison-card__accent comparison-card__accent--secondary"} />
            <div className="comparison-card__header">
              <div className="stack">
                <h3>{item.name}</h3>
                <p>{item.currentTitle}</p>
                <div className="skill-list">
                  <Tag tone="primary">{item.seniority}</Tag>
                  <Tag>{item.yearsExperience} years</Tag>
                </div>
              </div>
              <div className="score-pill">
                <strong>{item.score}</strong>
                <span>Composite</span>
              </div>
            </div>

            <div className="stack">
              <div className="signal-row">
                <strong>Matched skills</strong>
                <span>{item.matchedSkills.length}</span>
              </div>
              <ProgressBar value={Math.min(100, item.matchedSkills.length * 24 + 20)} />
            </div>

            <div className="stack">
              <h4>Summary</h4>
              <p>{item.summary}</p>
            </div>

            <div className="stack">
              <h4>Strengths</h4>
              <ul className="bullet-list">
                {item.strengths.map((strength) => (
                  <li key={strength}>{strength}</li>
                ))}
              </ul>
            </div>

            <div className="stack">
              <h4>Gaps</h4>
              {item.gaps.length ? (
                <div className="skill-list">
                  {item.gaps.map((gap) => (
                    <Tag key={gap} tone="warning">
                      {gap}
                    </Tag>
                  ))}
                </div>
              ) : (
                <Tag tone="success">No explicit gaps for selected skills</Tag>
              )}
            </div>
          </Panel>
        ))}
      </div>

      <div className="two-column-grid">
        <Panel className="table-card">
          <div className="stack">
            <h3>Shared overlap</h3>
            <div className="skill-list">
              {response.overlap.map((skill) => (
                <Tag key={skill} tone="primary">
                  {skill}
                </Tag>
              ))}
            </div>
            <p>Overlap is derived from structured skills and cached summaries, then presented as reusable recruiter-facing evidence.</p>
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <h3>Decision support</h3>
            <p>The comparison API can return cached artifacts when they exist. This frontend also handles deterministic fallback payloads from the current Supabase function.</p>
            {response.recommendedCandidateId ? (
              <Link className="button button--primary" to={`/dossier/${response.recommendedCandidateId}`}>
                Open recommended dossier
              </Link>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
