import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookmarkPlus,
  BriefcaseBusiness,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  FileSearch,
  Mail,
  Plus,
  Save,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { EmptyState, PageIntro, Panel, ScorePill, Tag } from "@/components/ui";
import type { EmployerRegion, JobApplicationStatus, JobExtractionResult, JobPosting, JobPostingInput, JobPostingStatus } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";

const regionOptions: EmployerRegion[] = ["GCC", "EU", "USA"];
const seniorityOptions = ["Intern", "Junior", "Mid", "Senior", "Lead", "Principal", "Executive"];
const employmentTypeOptions = ["Full-time", "Part-time", "Contract", "Temporary", "Internship", "Freelance"];
const applicationStatusOptions: JobApplicationStatus[] = ["new", "reviewing", "shortlisted", "rejected", "withdrawn"];

type JobFormState = {
  id?: string;
  tenantId: string;
  title: string;
  employerName: string;
  employerCountry: string;
  employerRegion: EmployerRegion;
  jobDescription: string;
  requiredSkills: string;
  preferredSkills: string;
  seniorityLevel: string;
  employmentType: string;
  applicationDeadline: string;
  locationCountry: string;
  locationCity: string;
  remotePolicy: string;
  keyResponsibilities: string;
  status: JobPostingStatus;
  isPublic: boolean;
  publicSlug: string;
  publicTitle: string;
  publicSummary: string;
  publicDescription: string;
  publicLocation: string;
  publicApplyEnabled: boolean;
  aiProfile: Record<string, unknown>;
  aiConfidence: Record<string, unknown>;
};

function splitList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(values: string[]) {
  return values.join(", ");
}

function emptyJobForm(tenantId: string): JobFormState {
  return {
    tenantId,
    title: "",
    employerName: "",
    employerCountry: "",
    employerRegion: "GCC",
    jobDescription: "",
    requiredSkills: "",
    preferredSkills: "",
    seniorityLevel: "",
    employmentType: "",
    applicationDeadline: "",
    locationCountry: "",
    locationCity: "",
    remotePolicy: "Unspecified",
    keyResponsibilities: "",
    status: "draft",
    isPublic: false,
    publicSlug: "",
    publicTitle: "",
    publicSummary: "",
    publicDescription: "",
    publicLocation: "",
    publicApplyEnabled: true,
    aiProfile: {},
    aiConfidence: {},
  };
}

function formFromJob(job: JobPosting): JobFormState {
  return {
    id: job.id,
    tenantId: job.tenantId,
    title: job.title,
    employerName: job.employerName,
    employerCountry: job.employerCountry,
    employerRegion: job.employerRegion,
    jobDescription: job.jobDescription,
    requiredSkills: joinList(job.requiredSkills),
    preferredSkills: joinList(job.preferredSkills),
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    applicationDeadline: job.applicationDeadline ?? "",
    locationCountry: job.locationInfo.country ?? "",
    locationCity: job.locationInfo.city ?? "",
    remotePolicy: job.locationInfo.remotePolicy ?? "Unspecified",
    keyResponsibilities: job.keyResponsibilities.join("\n"),
    status: job.status,
    isPublic: job.isPublic,
    publicSlug: job.publicSlug ?? "",
    publicTitle: job.publicTitle ?? "",
    publicSummary: job.publicSummary ?? "",
    publicDescription: job.publicDescription ?? "",
    publicLocation: job.publicLocation ?? "",
    publicApplyEnabled: job.publicApplyEnabled,
    aiProfile: job.aiProfile,
    aiConfidence: job.aiConfidence,
  };
}

function jobInputFromForm(form: JobFormState, status: JobPostingStatus): JobPostingInput {
  const requiredSkills = splitList(form.requiredSkills);
  const preferredSkills = splitList(form.preferredSkills).filter((skill) => !requiredSkills.includes(skill));
  return {
    id: form.id,
    tenantId: form.tenantId,
    title: form.title.trim(),
    employerName: form.employerName.trim(),
    employerCountry: form.employerCountry.trim(),
    employerRegion: form.employerRegion,
    jobDescription: form.jobDescription.trim(),
    requiredSkills,
    preferredSkills,
    seniorityLevel: form.seniorityLevel,
    employmentType: form.employmentType,
    applicationDeadline: form.applicationDeadline || null,
    status,
    locationInfo: {
      country: form.locationCountry || form.employerCountry || null,
      city: form.locationCity || null,
      region: form.employerRegion,
      remotePolicy: form.remotePolicy || "Unspecified",
    },
    keyResponsibilities: splitList(form.keyResponsibilities),
    isPublic: form.isPublic,
    publicSlug: form.publicSlug,
    publicTitle: form.publicTitle,
    publicSummary: form.publicSummary,
    publicDescription: form.publicDescription,
    publicLocation: form.publicLocation,
    publicApplyEnabled: form.publicApplyEnabled,
    aiProfile: form.aiProfile,
    aiConfidence: form.aiConfidence,
  };
}

function applyExtraction(form: JobFormState, extraction: JobExtractionResult): JobFormState {
  return {
    ...form,
    requiredSkills: joinList(extraction.requiredSkills.map((skill) => skill.name)),
    preferredSkills: joinList(extraction.preferredSkills.map((skill) => skill.name)),
    seniorityLevel: extraction.seniorityLevel.value || form.seniorityLevel,
    employmentType: extraction.employmentType.value || form.employmentType,
    locationCountry: extraction.location.country ?? form.locationCountry,
    locationCity: extraction.location.city ?? form.locationCity,
    remotePolicy: extraction.location.remotePolicy ?? form.remotePolicy,
    keyResponsibilities: extraction.keyResponsibilities.join("\n"),
    aiProfile: extraction as unknown as Record<string, unknown>,
    aiConfidence: {
      seniorityLevel: extraction.seniorityLevel.confidence,
      employmentType: extraction.employmentType.confidence,
      location: extraction.location.confidence,
      requiredSkills: extraction.requiredSkills.map((skill) => ({ name: skill.name, confidence: skill.confidence })),
      preferredSkills: extraction.preferredSkills.map((skill) => ({ name: skill.name, confidence: skill.confidence })),
    },
  };
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusTone(status: JobPostingStatus) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "closed") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function ingestionTone(status: string | null | undefined) {
  if (status === "parsed") {
    return "success" as const;
  }
  if (status === "failed") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function publicJobHref(job: JobPosting) {
  return job.publicSlug ? `#/careers/${job.publicSlug}` : null;
}

function locationLabel(job: JobPosting) {
  return [job.locationInfo.city, job.locationInfo.country || job.employerCountry].filter(Boolean).join(", ") || "Location not set";
}

function validateJobForm(form: JobFormState, status: JobPostingStatus) {
  const missing: string[] = [];
  if (!form.title.trim()) missing.push("title");
  if (!form.employerName.trim()) missing.push("employer name");
  if (!form.employerCountry.trim()) missing.push("employer country");
  if (!form.jobDescription.trim()) missing.push("job description");
  if (status === "active") {
    if (!splitList(form.requiredSkills).length) missing.push("required skills");
    if (!form.seniorityLevel.trim()) missing.push("seniority level");
    if (!form.employmentType.trim()) missing.push("employment type");
    if (form.isPublic) {
      if (!form.publicSlug.trim()) missing.push("public slug");
      if (!form.publicDescription.trim()) missing.push("redacted public description");
    }
  }
  return missing;
}

type JobEditorProps = {
  initialForm: JobFormState;
  onSaved?: (job: JobPosting) => void;
};

function JobEditor({ initialForm, onSaved }: JobEditorProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<JobExtractionResult | null>(null);

  useEffect(() => {
    setForm(initialForm);
    setExtraction(null);
    setError(null);
    setNotice(null);
  }, [initialForm]);

  const saveMutation = useMutation({
    mutationFn: (status: JobPostingStatus) => platformApi.saveJobPosting(jobInputFromForm(form, status)),
    onSuccess: (job) => {
      setForm(formFromJob(job));
      setNotice(job.status === "active" ? "Job is active and ready for matching." : "Draft saved.");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["job-postings"] });
      void queryClient.invalidateQueries({ queryKey: ["job-posting", job.id] });
      onSaved?.(job);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to save job posting.");
    },
  });

  const extractMutation = useMutation({
    mutationFn: () =>
      platformApi.extractJobPosting({
        tenantId: form.tenantId,
        jobId: form.id,
        title: form.title,
        employerRegion: form.employerRegion,
        jobDescription: form.jobDescription,
      }),
    onSuccess: (result) => {
      setExtraction(result);
      setForm((current) => applyExtraction(current, result));
      setNotice("AI extraction applied. Review the fields before publishing.");
      setError(null);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to extract this job description.");
    },
  });

  const update = <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = (status: JobPostingStatus) => {
    const missing = validateJobForm(form, status);
    if (missing.length) {
      setError(`Add ${missing.join(", ")} before saving this job${status === "active" ? " as active" : ""}.`);
      setNotice(null);
      return;
    }
    saveMutation.mutate(status);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    handleSave(form.status);
  };

  return (
    <Panel className="job-editor-panel">
      <form className="job-editor" onSubmit={handleSubmit}>
        <div className="job-editor__header">
          <div>
            <h2>{form.id ? "Edit job posting" : "Create job posting"}</h2>
            <p>Employer fields stay internal. Candidate-facing views must use redacted job data.</p>
          </div>
          <Tag tone={statusTone(form.status)}>{form.status}</Tag>
        </div>

        {error ? <div className="status-banner">{error}</div> : null}
        {notice ? <div className="status-banner">{notice}</div> : null}

        <div className="parser-form-grid">
          <label className="parser-field">
            <span>Title</span>
            <input className="form-input" value={form.title} onChange={(event) => update("title", event.target.value)} required />
          </label>
          <label className="parser-field">
            <span>Employer name</span>
            <input className="form-input" value={form.employerName} onChange={(event) => update("employerName", event.target.value)} required />
          </label>
          <label className="parser-field">
            <span>Employer country</span>
            <input className="form-input" value={form.employerCountry} onChange={(event) => update("employerCountry", event.target.value)} required />
          </label>
          <label className="parser-field">
            <span>Employer region</span>
            <select className="form-select" value={form.employerRegion} onChange={(event) => update("employerRegion", event.target.value as EmployerRegion)}>
              {regionOptions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>
          <label className="parser-field parser-field--full">
            <span>Job description</span>
            <textarea className="form-textarea job-editor__jd" value={form.jobDescription} onChange={(event) => update("jobDescription", event.target.value)} required />
          </label>
        </div>

        <div className="job-editor__extract-row">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending || form.jobDescription.trim().length < 20}
          >
            <Sparkles size={16} />
            {extractMutation.isPending ? "Extracting" : "Extract from JD"}
          </button>
          {extraction?.warnings.length ? (
            <span className="job-editor__warning">{extraction.warnings.map((item) => item.message).join(" ")}</span>
          ) : null}
        </div>

        <div className="parser-form-grid">
          <label className="parser-field parser-field--full">
            <span>Required skills</span>
            <input className="form-input" value={form.requiredSkills} onChange={(event) => update("requiredSkills", event.target.value)} placeholder="React, TypeScript, REST APIs" />
          </label>
          <label className="parser-field parser-field--full">
            <span>Preferred skills</span>
            <input className="form-input" value={form.preferredSkills} onChange={(event) => update("preferredSkills", event.target.value)} placeholder="Next.js, Banking domain" />
          </label>
          <label className="parser-field">
            <span>Seniority level</span>
            <select className="form-select" value={form.seniorityLevel} onChange={(event) => update("seniorityLevel", event.target.value)}>
              <option value="">Select seniority</option>
              {seniorityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="parser-field">
            <span>Employment type</span>
            <select className="form-select" value={form.employmentType} onChange={(event) => update("employmentType", event.target.value)}>
              <option value="">Select type</option>
              {employmentTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="parser-field">
            <span>Deadline</span>
            <input className="form-input" type="date" value={form.applicationDeadline} onChange={(event) => update("applicationDeadline", event.target.value)} />
          </label>
          <label className="parser-field">
            <span>Remote policy</span>
            <select className="form-select" value={form.remotePolicy} onChange={(event) => update("remotePolicy", event.target.value)}>
              {["Unspecified", "Onsite", "Hybrid", "Remote"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="parser-field">
            <span>Job country</span>
            <input className="form-input" value={form.locationCountry} onChange={(event) => update("locationCountry", event.target.value)} />
          </label>
          <label className="parser-field">
            <span>Job city</span>
            <input className="form-input" value={form.locationCity} onChange={(event) => update("locationCity", event.target.value)} />
          </label>
          <label className="parser-field parser-field--full">
            <span>Key responsibilities</span>
            <textarea className="form-textarea" value={form.keyResponsibilities} onChange={(event) => update("keyResponsibilities", event.target.value)} />
          </label>
        </div>

        <div className="job-public-settings">
          <label className="job-public-settings__toggle">
            <input type="checkbox" checked={form.isPublic} onChange={(event) => update("isPublic", event.target.checked)} />
            <span>Public application page</span>
          </label>
          {form.isPublic ? (
            <div className="parser-form-grid">
              <label className="parser-field">
                <span>Public slug</span>
                <input className="form-input" value={form.publicSlug} onChange={(event) => update("publicSlug", event.target.value)} placeholder="senior-react-developer-dubai" />
              </label>
              <label className="parser-field">
                <span>Public title</span>
                <input className="form-input" value={form.publicTitle} onChange={(event) => update("publicTitle", event.target.value)} placeholder={form.title || "Public job title"} />
              </label>
              <label className="parser-field">
                <span>Public location</span>
                <input className="form-input" value={form.publicLocation} onChange={(event) => update("publicLocation", event.target.value)} placeholder="Dubai, UAE" />
              </label>
              <label className="parser-field">
                <span>Applications</span>
                <select className="form-select" value={form.publicApplyEnabled ? "open" : "closed"} onChange={(event) => update("publicApplyEnabled", event.target.value === "open")}>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="parser-field parser-field--full">
                <span>Public summary</span>
                <input className="form-input" value={form.publicSummary} onChange={(event) => update("publicSummary", event.target.value)} placeholder="Short candidate-facing summary" />
              </label>
              <label className="parser-field parser-field--full">
                <span>Redacted public description</span>
                <textarea className="form-textarea" value={form.publicDescription} onChange={(event) => update("publicDescription", event.target.value)} />
              </label>
            </div>
          ) : null}
        </div>

        <div className="job-editor__actions">
          <button className="button button--secondary" type="button" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
            <Save size={16} />
            Save Draft
          </button>
          <button className="button button--primary" type="button" onClick={() => handleSave("active")} disabled={saveMutation.isPending}>
            <CheckCircle2 size={16} />
            Publish Active
          </button>
          {form.id ? (
            <button className="button button--secondary" type="button" onClick={() => handleSave("closed")} disabled={saveMutation.isPending}>
              <XCircle size={16} />
              Close
            </button>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}

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
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search jobs"
                aria-label="Search jobs"
              />
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
                          <span>{locationLabel(job)} · {job.employmentType || "Type missing"}</span>
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

export function JobPostingCreatePage() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
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
  const tenantId = currentWorkspace?.id ?? currentTenant?.id ?? resolvedTenantIds[0] ?? "mock-tenant";
  const initialForm = useMemo(() => emptyJobForm(tenantId), [tenantId]);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="New Job Posting"
        title="Create Job Posting"
        description="Paste the JD, extract structured requirements, review the fields, then save or publish."
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
            <Link className="button button--secondary" to="/jobs">
              <ArrowLeft size={16} />
              Back
            </Link>
          </div>
        }
      />

      {isAllScope ? <div className="status-banner">This posting will be created in the currently selected workspace.</div> : null}

      <div className="job-form-page">
        <JobEditor initialForm={initialForm} onSaved={(job) => navigate(`/jobs/${job.id}`)} />
      </div>
    </div>
  );
}

export function JobPostingEditPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const jobQuery = useQuery({
    queryKey: ["job-posting", jobId],
    queryFn: () => platformApi.getJobPosting(jobId ?? ""),
    enabled: Boolean(jobId),
  });
  const job = jobQuery.data;
  const initialForm = useMemo(() => (job ? formFromJob(job) : emptyJobForm("mock-tenant")), [job]);

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
        <PageIntro title="Loading job" description="Fetching posting for editing." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Edit Job Posting"
        title={job.title || "Untitled job"}
        description={`${job.employerName} · Updated ${formatDate(job.updatedAt)}`}
        actions={
          <div className="job-page-actions">
            <Link className="button button--secondary" to={`/jobs/${job.id}`}>
              <ArrowLeft size={16} />
              Back
            </Link>
          </div>
        }
      />

      <div className="job-form-page">
        <JobEditor initialForm={initialForm} onSaved={(savedJob) => navigate(`/jobs/${savedJob.id}`)} />
      </div>
    </div>
  );
}

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
          <Panel className="job-summary-panel">
            <div className="job-editor__header">
              <div>
                <h2>Posting summary</h2>
                <p>Posted {formatDate(job.postedDate)} · Deadline {formatDate(job.applicationDeadline)}</p>
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
              {job.requiredSkills.map((skill) => <Tag key={skill} tone="success">{skill}</Tag>)}
              {job.preferredSkills.map((skill) => <Tag key={skill}>{skill}</Tag>)}
            </div>
            <p>{job.jobDescription.slice(0, 420)}{job.jobDescription.length > 420 ? "..." : ""}</p>
          </Panel>

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
                      onChange={(event) => updateApplicationMutation.mutate({ applicationId: application.id, status: event.target.value as JobApplicationStatus })}
                    >
                      {applicationStatusOptions.map((status) => (
                        <option key={status} value={status}>{status}</option>
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
  }, [results.length]);

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
        <input className="form-input" value={shortlistName} onChange={(event) => setShortlistName(event.target.value)} placeholder="Senior Data Engineer - Riyadh - Batch 1" />
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
                  <p>{currentTitle} · {String(snapshot.location ?? "Unknown location")}</p>
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
                {result.matchedSkills.map((skill) => <Tag key={skill} tone="success">{skill}</Tag>)}
                {result.missingSkills.map((skill) => <Tag key={skill} tone="warning">{skill}</Tag>)}
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
