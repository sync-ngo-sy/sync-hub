// frontend/src/features/jobs/pages/JobPostingDetailPage.tsx

import React, { useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Mail } from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, Panel, Tag } from "@/components/ui";
import type { JobApplicationStatus, JobPosting } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { applicationStatusOptions } from "@/features/jobs/jobForm";
import { JobPostingPerformancePanel } from "@/features/jobs/components/JobPostingPerformancePanel";
import { formatDate, ingestionTone, locationLabel, publicJobHref, statusTone } from "@/features/jobs/jobPresentation";
import { mockJobPosting } from "@/features/jobs/jobMocks";
import bookmarkIcon from "@/assets/save.svg";
import openLinkIcon from "@/assets/open_link.svg";
import findMatchesIcon from "@/assets/find_matches.svg";
import editNoteIcon from "@/assets/edit_note.svg";

type DetailTab = "runs" | "applicants" | "performance" | "shortlists";

export function JobPostingDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>("runs");

  const isDummy = jobId === "dummy-job-id";

  const jobQuery = useQuery({
    queryKey: ["job-posting", jobId],
    queryFn: () => isDummy ? Promise.resolve(mockJobPosting) : platformApi.getJobPosting(jobId ?? ""),
    enabled: Boolean(jobId),
  });
  const runsQuery = useQuery({
    queryKey: ["job-matching-runs", jobId],
    queryFn: () => isDummy ? Promise.resolve([]) : platformApi.listJobMatchingRuns(jobId ?? ""),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  });
  const shortlistsQuery = useQuery({
    queryKey: ["job-shortlists", jobId],
    queryFn: () => isDummy ? Promise.resolve([]) : platformApi.listJobShortlists(jobId ?? ""),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  });
  const applicationsQuery = useQuery({
    queryKey: ["job-applications", jobId],
    queryFn: () => isDummy ? Promise.resolve([]) : platformApi.listJobApplications(jobId ?? ""),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  });
  const updateApplicationMutation = useMutation({
    mutationFn: (input: { applicationId: string; status: JobApplicationStatus }) =>
      platformApi.updateJobApplicationStatus(input.applicationId, input.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["job-applications", jobId] });
    },
  });
  const matchMutation = useMutation({
    mutationFn: () => platformApi.startJobMatchingRun({
      jobId: jobId ?? "",
      limit: 20,
      semanticPoolSize: 200,
      rerankPoolSize: 50
    }),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: ["job-matching-runs", jobId] });
      navigate(`/jobs/${jobId}/runs/${detail.run.id}`);
    },
  });
  const job = jobQuery.data;

  const handleDivKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  if (jobQuery.error) {
    return (
      <div className="page-stack flex items-center justify-center min-h-[60vh] p-4">
        <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-2xl w-full text-center flex flex-col items-center gap-6 shadow-[var(--shadow)]">
          <h2 className="text-2xl font-bold text-[var(--text)] m-0">Unable to load job</h2>
          <p className="text-[15px] text-[var(--text-muted)] m-0">{String(jobQuery.error)}</p>
          <Link
            to="/jobs"
            className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)] cursor-pointer no-underline"
          >
            <ArrowLeft size={16} />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">Back to Jobs</span>
          </Link>
        </div>
      </div>
    );
  }

  if (jobQuery.isLoading || !job) {
    return (
      <div className="page-stack flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-muted)]">Loading job details...</div>
      </div>
    );
  }

  return (
    <div className="page-stack" style={{ width: "100%", maxWidth: "100%" }}>
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-4">
          <Link
            to="/jobs"
            className="w-11 h-11 rounded-full flex items-center justify-center bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer transition-all duration-300"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">{job.title || "Untitled job"}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {job.employerName} · {job.employerCountry} · {job.requiredSkills.length} required skills
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/jobs/${job.id}/edit`}
            className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0 bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)] cursor-pointer no-underline [--icon-filter=brightness(0)_invert(1)_opacity(0.7)] hover:[--icon-filter=brightness(0)_invert(1)]"
            style={{ boxSizing: "border-box", transition: "background-color 300ms ease-in-out, color 300ms ease-in-out" }}
          >
            <img src={editNoteIcon} alt="" width={16} height={16} className="transition-all duration-300 ease-in-out shrink-0" style={{ display: "block", filter: "var(--icon-filter)" }} />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">Edit</span>
          </Link>

          {publicJobHref(job) ? (
            <a
              href={publicJobHref(job) ?? undefined}
              className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0 bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)] cursor-pointer no-underline [--icon-filter=brightness(0)_invert(1)_opacity(0.7)] hover:[--icon-filter=brightness(0)_invert(1)]"
              style={{ boxSizing: "border-box", transition: "background-color 300ms ease-in-out, color 300ms ease-in-out" }}
            >
              <img src={openLinkIcon} alt="" width={16} height={16} className="transition-all duration-300 ease-in-out shrink-0" style={{ display: "block", filter: "var(--icon-filter)" }} />
              <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">Public Page</span>
            </a>
          ) : null}

          <div
            role="button"
            tabIndex={job.status !== "active" || matchMutation.isPending ? -1 : 0}
            onClick={() => matchMutation.mutate()}
            onKeyDown={(e) => handleDivKeyDown(e, () => matchMutation.mutate())}
            className={`group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0
              ${job.status !== "active" || matchMutation.isPending
              ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60 [--icon-filter=brightness(0)_saturate(100%)_invert(91%)_sepia(5%)_saturate(702%)_hue-rotate(124deg)_opacity(0.8)]"
              : "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer [--icon-filter=brightness(0)_saturate(100%)_invert(21%)_sepia(3%)_saturate(137%)_hue-rotate(201deg)_opacity(0.8)] hover:[--icon-filter=brightness(0)_saturate(100%)_invert(100%)_sepia(10%)_saturate(151%)_hue-rotate(113deg)]"
            }`}
            style={{ boxSizing: "border-box", transition: "background-color 300ms ease-in-out, color 300ms ease-in-out" }}
          >
            <img src={findMatchesIcon} alt="" width={16} height={16} className="transition-all duration-300 ease-in-out shrink-0" style={{ display: "block", filter: "var(--icon-filter)" }} />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
              {matchMutation.isPending ? "Matching..." : "Find Matches"}
            </span>
          </div>
        </div>
      </div>

      {matchMutation.error ? <div className="status-banner mb-4">{String(matchMutation.error)}</div> : null}

      <div className="page-stack gap-6">
        <JobSummaryPanel job={job} />

        {/* Full Width Tab Navigation */}
        <div className="flex items-center gap-2 w-full">
          {(["runs", "applicants", "performance", "shortlists"] as DetailTab[]).map((tab) => {
            const label = tab === "runs"
              ? "Matching Runs"
              : tab === "applicants"
              ? "Applicants"
              : tab === "performance"
              ? "Performance"
              : "Shortlists";
            return (
              <div
                key={tab}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveTab(tab);
                  }
                }}
                className={`flex-1 rounded-xl text-[15px] tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 font-normal px-2
                  ${activeTab === tab
                  ? "bg-[var(--primary)] text-[#39393a]"
                  : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                }`}
              >
                <span className="leading-none font-normal truncate">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "runs" && (
          <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
            <div className="p-6">
              {runsQuery.data?.length ? (
                <div className="flex flex-col gap-3">
                  {runsQuery.data.map((run) => (
                    <Link key={run.id} className="job-run-row group" to={`/jobs/${job.id}/runs/${run.id}`}>
                      <BriefcaseBusiness size={16} className="text-[var(--text-muted)]" />
                      <span className="text-sm text-[var(--text)]">{formatDate(run.createdAt)}</span>
                      <Tag tone={run.status === "completed" ? "success" : run.status === "failed" ? "warning" : "neutral"}>{run.status}</Tag>
                      <strong className="text-sm text-[var(--text)]">{run.completedCount} candidates</strong>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matching runs" detail="Publish this job and run matching to generate a ranked candidate shortlist." />
              )}
            </div>
          </Panel>
        )}

        {activeTab === "applicants" && (
          <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
            <div className="p-6">
              {applicationsQuery.data?.length ? (
                <div className="flex flex-col gap-4">
                  {applicationsQuery.data.map((application) => (
                    <div key={application.id} className="flex items-center gap-4 p-4 bg-[var(--border)] rounded-2xl">
                      <Mail size={18} className="text-[var(--text-muted)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-[var(--text)]">{application.applicantName}</strong>
                          <span className="text-xs text-[var(--text-muted)] truncate">
                            {application.applicantEmail} · {formatDate(application.submittedAt)}
                            {application.resumeOriginalFilename ? ` · ${application.resumeOriginalFilename}` : ""}
                          </span>
                        </div>
                        {application.resumeIngestionError ? (
                          <span className="text-xs text-red-400 block mt-1">{application.resumeIngestionError}</span>
                        ) : null}
                      </div>
                      <Tag tone={ingestionTone(application.resumeIngestionStatus)}>CV {application.resumeIngestionStatus.replace("_", " ")}</Tag>
                      <label className="search-field h-9 w-auto transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3 pr-2 relative flex items-center outline-none max-w-[160px]">
                        <select
                          className="bg-transparent border-none outline-none w-full text-sm text-[var(--text)] p-0 h-full appearance-none cursor-pointer"
                          value={application.status}
                          aria-label={`Update status for ${application.applicantName}`}
                          onChange={(event) => updateApplicationMutation.mutate({
                            applicationId: application.id,
                            status: event.target.value as JobApplicationStatus
                          })}
                        >
                          {applicationStatusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No public applications captured for this job yet.</p>
              )}
            </div>
          </Panel>
        )}

        {activeTab === "performance" && <JobPostingPerformancePanel job={job} />}

        {activeTab === "shortlists" && (
          <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
            <div className="p-6">
              {shortlistsQuery.data?.length ? (
                <div className="flex flex-col gap-3">
                  {shortlistsQuery.data.map((shortlist) => (
                    <div key={shortlist.id} className="flex items-center gap-3 p-3 bg-[var(--border)] rounded-xl">
                      <img src={bookmarkIcon} alt="" width={16} height={16} className="opacity-70 shrink-0" style={{ display: "block", filter: "brightness(0) invert(1) opacity(0.7)" }} />
                      <span className="text-sm text-[var(--text)]">{shortlist.name}</span>
                      <strong className="text-xs text-[var(--text-muted)] ml-auto">{formatDate(shortlist.createdAt)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No named shortlists saved for this job yet.</p>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function JobSummaryPanel({ job }: { job: JobPosting }) {
  const capitalizedStatus = job.status.charAt(0).toUpperCase() + job.status.slice(1);

  return (
    <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)] m-0">Posting Summary</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Posted {formatDate(job.postedDate)} · Deadline {formatDate(job.applicationDeadline)}
            </p>
          </div>
          <Tag tone={statusTone(job.status)}>{capitalizedStatus}</Tag>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Tag>{job.employerRegion}</Tag>
          <Tag>{job.seniorityLevel || "Seniority missing"}</Tag>
          <Tag>{job.employmentType || "Type missing"}</Tag>
          <Tag>{locationLabel(job)}</Tag>
          <Tag tone={job.isPublic ? "success" : "neutral"}>{job.isPublic ? "Public" : "Internal"}</Tag>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {job.requiredSkills.map((skill) => (
            <Tag key={skill} tone="success">{skill}</Tag>
          ))}
          {job.preferredSkills.map((skill) => (
            <Tag key={skill}>{skill}</Tag>
          ))}
        </div>

        <p className="text-sm text-[var(--text-muted)] leading-relaxed m-0">
          {job.jobDescription.slice(0, 420)}
          {job.jobDescription.length > 420 ? "..." : ""}
        </p>
      </div>
    </Panel>
  );
}
