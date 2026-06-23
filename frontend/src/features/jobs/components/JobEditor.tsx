import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, Save, Sparkles, XCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, Tag } from "@/components/ui";
import type { EmployerRegion, JobExtractionResult, JobPosting, JobPostingStatus } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import {
  applyExtraction,
  employmentTypeOptions,
  jobInputFromForm,
  regionOptions,
  seniorityOptions,
  validateJobForm,
  formFromJob,
  type JobFormState,
} from "@/features/jobs/jobForm";
import { statusTone } from "@/features/jobs/jobPresentation";

type JobEditorProps = {
  initialForm: JobFormState;
  onSaved?: (job: JobPosting) => void;
};

export function JobEditor({ initialForm, onSaved }: JobEditorProps) {
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
                <option key={region} value={region}>
                  {region}
                </option>
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
          {extraction?.warnings.length ? <span className="job-editor__warning">{extraction.warnings.map((item) => item.message).join(" ")}</span> : null}
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
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="parser-field">
            <span>Employment type</span>
            <select className="form-select" value={form.employmentType} onChange={(event) => update("employmentType", event.target.value)}>
              <option value="">Select type</option>
              {employmentTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
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
                <option key={option} value={option}>
                  {option}
                </option>
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
