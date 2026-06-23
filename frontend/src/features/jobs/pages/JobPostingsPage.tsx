import { useMemo, useState } from "react";
import { Edit3, ExternalLink, Eye, Plus, Search } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { EmptyState, PageIntro, Panel, Tag } from "@/components/ui";
import type { JobPostingStatus } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { formatDate, locationLabel, publicJobHref, statusTone } from "@/features/jobs/jobPresentation";

type JobStatusFilter = "all" | JobPostingStatus;

export function JobPostingsPage() {
  const {
    currentWorkspace,
    isAllScope,
    isPlatformAdmin,
    resolvedTenantIds,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();
  const scopeKey = resolvedTenantIds.join("|");
  const jobsQuery = useQuery({
    queryKey: ["job-postings", scopeKey],
    queryFn: () => platformApi.listJobPostings(resolvedTenantIds),
    placeholderData: keepPreviousData,
  });
  const jobs = jobsQuery.data ?? [];
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>("all");
  const filteredJobs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        job.title,
        job.employerName,
        job.employerCountry,
        job.employerRegion,
        job.seniorityLevel,
        job.employmentType,
        locationLabel(job),
        ...job.requiredSkills,
        ...job.preferredSkills,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [jobs, searchTerm, statusFilter]);
  const activeCount = jobs.filter((job) => job.status === "active").length;
  const publicCount = jobs.filter((job) => job.isPublic).length;

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Job Board"
        title="Job Postings"
        description="Create internal employer roles, extract structured requirements, and launch candidate matching runs."
        actions={
          <div className="job-page-actions">
            <PlatformScopeControl
              isPlatformAdmin={isPlatformAdmin}
              scopeMode={scopeMode}
              currentWorkspace={currentWorkspace}
              workspaceOptions={workspaceOptions}
              onChangeScopeMode={setScopeMode}
              onChangeWorkspace={setWorkspaceId}
            />
            <Link className="button button--primary" to="/jobs/new">
              <Plus size={16} />
              New Job
            </Link>
          </div>
        }
      />

      {isAllScope ? <div className="status-banner">Create and save actions use the currently selected workspace.</div> : null}

      <div className="stats-grid job-stats-grid">
        <Panel className="stat-card">
          <span className="stat-card__label">Total jobs</span>
          <strong>{jobs.length}</strong>
        </Panel>
        <Panel className="stat-card">
          <span className="stat-card__label">Active</span>
          <strong>{activeCount}</strong>
        </Panel>
        <Panel className="stat-card">
          <span className="stat-card__label">Public</span>
          <strong>{publicCount}</strong>
        </Panel>
        <Panel className="stat-card">
          <span className="stat-card__label">Drafts</span>
          <strong>{jobs.filter((job) => job.status === "draft").length}</strong>
        </Panel>
      </div>

      <Panel className="job-list-panel">
        <div className="job-table-toolbar">
          <div>
            <h2>Internal job postings</h2>
            <p>{jobsQuery.isLoading ? "Loading postings" : `${filteredJobs.length} of ${jobs.length} postings`}</p>
          </div>
          <div className="job-table-toolbar__filters">
            <label className="search-input search-input--compact">
              <Search size={16} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search jobs" aria-label="Search jobs" />
            </label>
            <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as JobStatusFilter)} aria-label="Filter jobs by status">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {jobsQuery.error ? <div className="status-banner">{String(jobsQuery.error)}</div> : null}
        {!jobsQuery.isLoading && !jobsQuery.error && !jobs.length ? (
          <EmptyState
            title="No job postings yet"
            detail="Create the first internal posting from a JD, then publish it for matching."
            action={
              <Link className="button button--primary" to="/jobs/new">
                <Plus size={16} />
                New Job
              </Link>
            }
          />
        ) : null}
        {!jobsQuery.isLoading && !jobsQuery.error && jobs.length > 0 && filteredJobs.length === 0 ? (
          <EmptyState title="No matching jobs" detail="Adjust the search text or status filter to see more postings." />
        ) : null}

        {jobsQuery.isLoading ? (
          <div className="job-table-loading">Loading job postings...</div>
        ) : filteredJobs.length ? (
          <div className="job-table-scroll">
            <table className="job-postings-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Employer</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Public</th>
                  <th>Posted</th>
                  <th>Deadline</th>
                  <th>Skills</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const publicHref = publicJobHref(job);
                  return (
                    <tr key={job.id}>
                      <td>
                        <Link className="job-table-title" to={`/jobs/${job.id}`}>
                          <strong>{job.title || "Untitled job"}</strong>
                          <span>
                            {locationLabel(job)} · {job.employmentType || "Type missing"}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <strong>{job.employerName}</strong>
                        <span>{job.employerCountry}</span>
                      </td>
                      <td>
                        <Tag>{job.employerRegion}</Tag>
                      </td>
                      <td>
                        <Tag tone={statusTone(job.status)}>{job.status}</Tag>
                      </td>
                      <td>
                        <div className="job-public-cell">
                          <Tag tone={job.isPublic ? "success" : "neutral"}>{job.isPublic ? "public" : "internal"}</Tag>
                          {job.isPublic ? <span>{job.publicApplyEnabled ? "Apply open" : "Apply closed"}</span> : null}
                        </div>
                      </td>
                      <td>{formatDate(job.postedDate)}</td>
                      <td>{formatDate(job.applicationDeadline)}</td>
                      <td>
                        <span className="job-table-skills">{job.requiredSkills.slice(0, 3).join(", ") || "Missing"}</span>
                      </td>
                      <td>
                        <div className="job-table-actions">
                          <Link className="icon-button" to={`/jobs/${job.id}`} aria-label={`View ${job.title}`} title="View">
                            <Eye size={16} />
                          </Link>
                          <Link className="icon-button" to={`/jobs/${job.id}/edit`} aria-label={`Edit ${job.title}`} title="Edit">
                            <Edit3 size={16} />
                          </Link>
                          {publicHref ? (
                            <a className="icon-button" href={publicHref} aria-label={`Open public page for ${job.title}`} title="Public page">
                              <ExternalLink size={16} />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
