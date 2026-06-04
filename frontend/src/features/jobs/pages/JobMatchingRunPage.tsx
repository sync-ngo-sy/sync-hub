import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { EmptyState, PageIntro, Panel, ScorePill, Tag } from "@/components/ui";
import { platformApi } from "@/lib/platformApi";
import { formatDate } from "@/features/jobs/jobPresentation";

export function JobMatchingRunPage() {
  const { jobId, runId } = useParams();
  const queryClient = useQueryClient();
  const [shortlistName, setShortlistName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const jobQuery = useQuery({
    queryKey: ["job-posting", jobId],
    queryFn: () => platformApi.getJobPosting(jobId ?? ""),
    enabled: Boolean(jobId),
  });
  const runQuery = useQuery({
    queryKey: ["job-matching-run", runId],
    queryFn: () => platformApi.getJobMatchingRun(runId ?? ""),
    enabled: Boolean(runId),
  });
  const saveShortlistMutation = useMutation({
    mutationFn: () =>
      platformApi.saveJobShortlist({
        jobId: jobId ?? "",
        runId,
        name: shortlistName || `${jobQuery.data?.title ?? "Job"} - ${formatDate(new Date().toISOString())}`,
        candidateIds: selectedIds.size ? Array.from(selectedIds) : runQuery.data?.results.map((result) => result.candidateId) ?? [],
      }),
    onSuccess: () => {
      setShortlistName("");
      void queryClient.invalidateQueries({ queryKey: ["job-shortlists", jobId] });
    },
  });
  const detail = runQuery.data;
  const results = detail?.results ?? [];

  useEffect(() => {
    if (results.length && selectedIds.size === 0) {
      setSelectedIds(new Set(results.slice(0, 20).map((result) => result.candidateId)));
    }
  }, [results, selectedIds.size]);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Matching Run"
        title={jobQuery.data?.title ?? "Candidate matches"}
        description={detail ? `${detail.run.completedCount} candidates ranked · ${formatDate(detail.run.createdAt)}` : "Loading ranked results"}
        actions={
          <div className="job-page-actions">
            <Link className="button button--secondary" to={`/jobs/${jobId}`}>
              <ArrowLeft size={16} />
              Back
            </Link>
          </div>
        }
      />

      {runQuery.error ? <div className="status-banner">{String(runQuery.error)}</div> : null}

      <Panel className="job-shortlist-save">
        <div>
          <h2>Save named shortlist</h2>
          <p>{selectedIds.size || results.length} candidates selected from this immutable run.</p>
        </div>
        <input
          className="form-input"
          value={shortlistName}
          onChange={(event) => setShortlistName(event.target.value)}
          placeholder="Senior Data Engineer - Riyadh - Batch 1"
          aria-label="Shortlist name"
        />
        <button className="button button--primary" type="button" disabled={!results.length || saveShortlistMutation.isPending} onClick={() => saveShortlistMutation.mutate()}>
          <BookmarkPlus size={16} />
          Save Shortlist
        </button>
      </Panel>
      {saveShortlistMutation.error ? <div className="status-banner">{String(saveShortlistMutation.error)}</div> : null}
      {saveShortlistMutation.isSuccess ? <div className="status-banner">Shortlist saved.</div> : null}

      {!runQuery.isLoading && !results.length ? (
        <EmptyState title="No candidates matched" detail="Review mandatory filters or broaden the job profile and run matching again." />
      ) : null}

      <div className="job-match-list">
        {results.map((result) => {
          const snapshot = result.candidateSnapshot;
          const candidateName = String(snapshot.name ?? "Unknown candidate");
          const currentTitle = String(snapshot.current_title ?? "Candidate");
          const selected = selectedIds.has(result.candidateId);
          return (
            <Panel key={result.id} className="job-match-card">
              <div className="job-match-card__header">
                <div className="job-match-card__rank">
                  <span>#{result.rank}</span>
                  <ScorePill score={result.finalScore} />
                </div>
                <div className="job-match-card__identity">
                  <h3>{candidateName}</h3>
                  <p>
                    {currentTitle} · {String(snapshot.location ?? "Unknown location")}
                  </p>
                </div>
                <label className="job-match-card__select">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) {
                          next.add(result.candidateId);
                        } else {
                          next.delete(result.candidateId);
                        }
                        return next;
                      });
                    }}
                  />
                  Shortlist
                </label>
              </div>
              <div className="meta-list">
                <Tag tone={result.seniorityAlignment === "Mismatch" ? "warning" : "success"}>{result.seniorityAlignment}</Tag>
                {result.matchedSkills.map((skill) => (
                  <Tag key={skill} tone="success">
                    {skill}
                  </Tag>
                ))}
                {result.missingSkills.map((skill) => (
                  <Tag key={skill} tone="warning">
                    {skill}
                  </Tag>
                ))}
              </div>
              <p>{result.experienceSummary}</p>
              <p>{result.matchExplanation}</p>
              <div className="job-match-card__actions">
                <Link className="button button--secondary button--compact" to={`/dossier/${result.candidateId}`}>
                  View dossier
                </Link>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
