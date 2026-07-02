// frontend/src/features/jobs/pages/JobMatchingRunPage.tsx

import React, { useEffect, useState } from "react";
import { ArrowLeft, BookmarkPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { EmptyState, Panel, ScorePill, Tag } from "@/components/ui";
import { platformApi } from "@/lib/platformApi";
import { formatDate } from "@/features/jobs/jobPresentation";
import { mockJobPosting, mockMatchingRunDetail } from "@/features/jobs/jobMocks";

export function JobMatchingRunPage() {
  const { jobId, runId } = useParams();
  const queryClient = useQueryClient();
  const [shortlistName, setShortlistName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isDummyJob = jobId === "dummy-job-id";
  const isDummyRun = runId === "dummy-run-id";

  const jobQuery = useQuery({
    queryKey: ["job-posting", jobId],
    queryFn: () => isDummyJob ? Promise.resolve(mockJobPosting) : platformApi.getJobPosting(jobId ?? ""),
    enabled: Boolean(jobId),
  });

  const runQuery = useQuery({
    queryKey: ["job-matching-run", runId],
    queryFn: () => isDummyRun ? Promise.resolve(mockMatchingRunDetail) : platformApi.getJobMatchingRun(runId ?? ""),
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

  const handleDivKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  if (runQuery.error) {
    return (
      <div className="page-stack flex items-center justify-center min-h-[60vh] p-4">
        <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-2xl w-full text-center flex flex-col items-center gap-6 shadow-[var(--shadow)]">
          <h2 className="text-2xl font-bold text-[var(--text)] m-0">Unable to load run</h2>
          <p className="text-[15px] text-[var(--text-muted)] m-0">{String(runQuery.error)}</p>
          <Link
            to={`/jobs/${jobId}`}
            className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)] cursor-pointer no-underline"
          >
            <ArrowLeft size={16} />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">Back to Job</span>
          </Link>
        </div>
      </div>
    );
  }

  if (runQuery.isLoading || !detail) {
    return (
      <div className="page-stack flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-muted)]">Loading ranked results...</div>
      </div>
    );
  }

  return (
    <div className="page-stack" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-4">
          <Link
            to={`/jobs/${jobId}`}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer transition-all duration-300 no-underline"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {jobQuery.data?.title ?? "Candidate matches"}
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {detail ? `${detail.run.completedCount} candidates ranked · ${formatDate(detail.run.createdAt)}` : "Loading ranked results"}
            </p>
          </div>
        </div>
      </div>

      {/* Status banners */}
      {saveShortlistMutation.error ? <div className="status-banner mb-4">{String(saveShortlistMutation.error)}</div> : null}
      {saveShortlistMutation.isSuccess ? <div className="status-banner mb-4">Shortlist saved.</div> : null}

      {/* Save Shortlist Panel - Fixed style prop */}
      <Panel className="!border-none relative overflow-hidden mb-6 rounded-[var(--radius,22px)]">
        <div className="p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-[var(--text)] m-0">Save Named Shortlist</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {selectedIds.size || results.length} candidates selected from this immutable run.
            </p>
          </div>

          <label className="search-field h-11 w-full md:w-80 transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
            <input
              value={shortlistName}
              onChange={(e) => setShortlistName(e.target.value)}
              placeholder="Senior Data Engineer - Riyadh - Batch 1"
              className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
            />
          </label>

          <div
            role="button"
            tabIndex={!results.length || saveShortlistMutation.isPending ? -1 : 0}
            onClick={() => saveShortlistMutation.mutate()}
            onKeyDown={(e) => handleDivKeyDown(e, () => saveShortlistMutation.mutate())}
            className={`group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0
              ${!results.length || saveShortlistMutation.isPending
              ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60"
              : "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer"
            }`}
            style={{ boxSizing: "border-box", transition: "background-color 300ms ease-in-out, color 300ms ease-in-out" }}
          >
            <BookmarkPlus size={16} className="transition-all duration-300 ease-in-out shrink-0" />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
              {saveShortlistMutation.isPending ? "Saving..." : "Save Shortlist"}
            </span>
          </div>
        </div>
      </Panel>

      {/* Empty State */}
      {!runQuery.isLoading && !results.length ? (
        <EmptyState title="No candidates matched" detail="Review mandatory filters or broaden the job profile and run matching again." />
      ) : null}

      {/* Candidate Cards */}
      <div className="grid grid-cols-1 gap-4">
        {results.map((result) => {
          const snapshot = result.candidateSnapshot;
          const candidateName = String(snapshot.name ?? "Unknown candidate");
          const currentTitle = String(snapshot.current_title ?? "Candidate");
          const selected = selectedIds.has(result.candidateId);

          return (
            <Panel key={result.id} className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
              <div className="p-5 flex flex-col gap-4">
                {/* Card Header */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center text-sm font-bold text-[var(--text)] shrink-0">
                    #{result.rank}
                  </div>

                  <ScorePill score={result.finalScore} />

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-[var(--text)] truncate">{candidateName}</h3>
                    <p className="text-sm text-[var(--text-muted)] truncate">
                      {currentTitle} · {String(snapshot.location ?? "Unknown location")}
                    </p>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer shrink-0 p-2 rounded-xl hover:bg-[var(--border)] transition-colors duration-200">
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
                      className="w-5 h-5 rounded accent-[var(--primary)]"
                    />
                    <span className="text-sm text-[var(--text-muted)] select-none">Shortlist</span>
                  </label>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={result.seniorityAlignment === "Mismatch" ? "warning" : "success"}>
                    {result.seniorityAlignment}
                  </Tag>
                  {result.matchedSkills.map((skill) => (
                    <Tag key={skill} tone="success">{skill}</Tag>
                  ))}
                  {result.missingSkills.map((skill) => (
                    <Tag key={skill} tone="warning">{skill}</Tag>
                  ))}
                </div>

                {/* Details */}
                <div className="text-sm text-[var(--text-muted)] leading-relaxed space-y-2">
                  <p className="m-0">{result.experienceSummary}</p>
                  <p className="m-0">{result.matchExplanation}</p>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-end pt-2 border-t border-[var(--border)]">
                  <Link
                    to={`/dossier/${result.candidateId}`}
                    className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-9 bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)] cursor-pointer no-underline"
                    style={{ boxSizing: "border-box", transition: "background-color 300ms ease-in-out, color 300ms ease-in-out" }}
                  >
                    <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">View Dossier</span>
                  </Link>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
