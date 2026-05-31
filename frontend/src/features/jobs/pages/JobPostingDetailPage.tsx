import { ArrowLeft, BookmarkPlus, BriefcaseBusiness, Edit3, ExternalLink, FileSearch, Mail } from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, PageIntro, Panel, ScorePill, Tag } from "@/components/ui";
import type { JobApplicationStatus, JobPosting } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { applicationStatusOptions } from "@/features/jobs/jobForm";
import { formatDate, ingestionTone, locationLabel, publicJobHref, statusTone } from "@/features/jobs/jobPresentation";

export function JobPostingDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jobQuery = useQuery({
    queryKey: ["job-posting", jobId],
    queryFn: () => platformApi.getJobPosting(jobId ?? ""),
    enabled: Boolean(jobId),
  });
  const runsQuery = useQuery({
    queryKey: ["job-matching-runs", jobId],
    queryFn: () => platformApi.listJobMatchingRuns(jobId ?? ""),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  });
  const shortlistsQuery = useQuery({
    queryKey: ["job-shortlists", jobId],
    queryFn: () => platformApi.listJobShortlists(jobId ?? ""),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  });
  const applicationsQuery = useQuery({
    queryKey: ["job-applications", jobId],
    queryFn: () => platformApi.listJobApplications(jobId ?? ""),
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
    mutationFn: () => platformApi.startJobMatchingRun({ jobId: jobId ?? "", limit: 20, semanticPoolSize: 200, rerankPoolSize: 50 }),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: ["job-matching-runs", jobId] });
      navigate(`/jobs/${jobId}/runs/${detail.run.id}`);
    },
  });
  const job = jobQuery.data;

  if (jobQuery.error) {
    return (
      <div className="page-stack">
        <PageIntro title="Unable to load job" description={String(jobQuery.error)} />
        <Link className="button button--secondary" to="/jobs">
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
    );
  }

  if (jobQuery.isLoading || !job) {
    return (
      <div className="page-stack">
        <PageIntro title="Loading job" description="Fetching posting detail." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Job Detail"
        title={job.title || "Untitled job"}
        description={`${job.employerName} · ${job.employerCountry} · ${job.requiredSkills.length} required skills`}
        actions={
          <div className="job-page-actions">
            <Link className="button button--secondary" to="/jobs">
              <ArrowLeft size={16} />
              Back
            </Link>
            <Link className="button button--secondary" to={`/jobs/${job.id}/edit`}>
              <Edit3 size={16} />
              Edit
            </Link>
            {publicJobHref(job) ? (
              <a className="button button--secondary" href={publicJobHref(job) ?? undefined}>
                <ExternalLink size={16} />
                Public Page
              </a>
            ) : null}
            <button className="button button--primary" type="button" onClick={() => matchMutation.mutate()} disabled={job.status !== "active" || matchMutation.isPending}>
              <FileSearch size={16} />
              {matchMutation.isPending ? "Matching" : "Find Matching Candidates"}
            </button>
          </div>
        }
      />

      {matchMutation.error ? <div className="status-banner">{String(matchMutation.error)}</div> : null}

      <div className="job-detail-grid">
        <div className="page-stack">
          <JobSummaryPanel job={job} />

          <Panel className="job-summary-panel">
            <h2>Matching runs</h2>
            {runsQuery.data?.length ? (
              <div className="job-run-list">
                {runsQuery.data.map((run) => (
                  <Link key={run.id} className="job-run-row" to={`/jobs/${job.id}/runs/${run.id}`}>
                    <BriefcaseBusiness size={16} />
                    <span>{formatDate(run.createdAt)}</span>
                    <Tag tone={run.status === "completed" ? "success" : run.status === "failed" ? "warning" : "neutral"}>{run.status}</Tag>
                    <strong>{run.completedCount} candidates</strong>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No matching runs" detail="Publish this job and run matching to generate a ranked candidate shortlist." />
            )}
          </Panel>

          <Panel className="job-summary-panel">
            <h2>Applicants</h2>
            {applicationsQuery.data?.length ? (
              <div className="job-run-list">
                {applicationsQuery.data.map((application) => (
                  <div key={application.id} className="job-run-row job-run-row--application">
                    <Mail size={16} />
                    <span>
                      <strong>{application.applicantName}</strong>
                      <small>
                        {application.applicantEmail} · {formatDate(application.submittedAt)}
                        {application.resumeOriginalFilename ? ` · ${application.resumeOriginalFilename}` : ""}
                        {application.resumeIngestionError ? ` · ${application.resumeIngestionError}` : ""}
                      </small>
                    </span>
                    <Tag tone={ingestionTone(application.resumeIngestionStatus)}>CV {application.resumeIngestionStatus.replace("_", " ")}</Tag>
                    <select
                      className="form-select"
                      value={application.status}
                      aria-label={`Update status for ${application.applicantName}`}
                      onChange={(event) => updateApplicationMutation.mutate({ applicationId: application.id, status: event.target.value as JobApplicationStatus })}
                    >
                      {applicationStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <p>No public applications captured for this job yet.</p>
            )}
          </Panel>

          <Panel className="job-summary-panel">
            <h2>Named shortlists</h2>
            {shortlistsQuery.data?.length ? (
              <div className="job-run-list">
                {shortlistsQuery.data.map((shortlist) => (
                  <div key={shortlist.id} className="job-run-row">
                    <BookmarkPlus size={16} />
                    <span>{shortlist.name}</span>
                    <strong>{formatDate(shortlist.createdAt)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p>No named shortlists saved for this job yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function JobSummaryPanel({ job }: { job: JobPosting }) {
  return (
    <Panel className="job-summary-panel">
      <div className="job-editor__header">
        <div>
          <h2>Posting summary</h2>
          <p>
            Posted {formatDate(job.postedDate)} · Deadline {formatDate(job.applicationDeadline)}
          </p>
        </div>
        <Tag tone={statusTone(job.status)}>{job.status}</Tag>
      </div>
      <div className="meta-list">
        <Tag>{job.employerRegion}</Tag>
        <Tag>{job.seniorityLevel || "Seniority missing"}</Tag>
        <Tag>{job.employmentType || "Type missing"}</Tag>
        <Tag>{locationLabel(job)}</Tag>
        <Tag tone={job.isPublic ? "success" : "neutral"}>{job.isPublic ? "Public" : "Internal"}</Tag>
      </div>
      <div className="meta-list">
        {job.requiredSkills.map((skill) => (
          <Tag key={skill} tone="success">
            {skill}
          </Tag>
        ))}
        {job.preferredSkills.map((skill) => (
          <Tag key={skill}>{skill}</Tag>
        ))}
      </div>
      <p>
        {job.jobDescription.slice(0, 420)}
        {job.jobDescription.length > 420 ? "..." : ""}
      </p>
    </Panel>
  );
}
