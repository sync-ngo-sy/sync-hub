import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, Send } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, Panel, Tag } from "@/components/ui";
import type { PublicJobApplicationInput, PublicJobPosting } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

function formatPublicDate(value?: string | null) {
  if (!value) {
    return "Open";
  }
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".docx", ".txt"];
const seniorityOptions = ["Intern", "Junior", "Mid", "Senior", "Lead", "Principal", "Executive"];

function isAllowedResumeFile(file: File) {
  const name = file.name.toLowerCase();
  return ALLOWED_RESUME_TYPES.has(file.type) || ALLOWED_RESUME_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",").pop() ?? "" : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read CV file."));
    reader.readAsDataURL(file);
  });
}

export function PublicJobBoardPage() {
  const [state, setState] = useState<{ isLoading: boolean; jobs: PublicJobPosting[]; error: string | null }>({
    isLoading: true,
    jobs: [],
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    platformApi.listPublicJobPostings()
      .then((jobs) => {
        if (active) {
          setState({ isLoading: false, jobs, error: null });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ isLoading: false, jobs: [], error: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const jobs = state.jobs;

  return (
    <main className="public-jobs-page">
      <section className="public-jobs-header">
        <span className="eyebrow">Careers</span>
        <h1>Open roles</h1>
      </section>

      {state.error ? <div className="status-banner">{state.error}</div> : null}
      {state.isLoading ? <EmptyState title="Loading roles" detail="Fetching public jobs from Supabase." /> : null}
      {!state.isLoading && !jobs.length ? <EmptyState title="No public jobs" detail="There are no public roles accepting applications right now." /> : null}

      <div className="public-job-list">
        {jobs.map((job) => (
          <Link key={job.slug} className="job-card public-job-card" to={`/careers/${job.slug}`}>
            <div className="job-card__main">
              <div>
                <h3>{job.title}</h3>
                <p>{job.location || "Location flexible"} · {job.employmentType}</p>
              </div>
              <Tag tone={job.applyEnabled ? "success" : "neutral"}>{job.applyEnabled ? "Apply" : "Closed"}</Tag>
            </div>
            <p>{job.summary || job.description.slice(0, 180)}</p>
            <div className="meta-list">
              <Tag>{job.seniorityLevel}</Tag>
              <Tag>{formatPublicDate(job.applicationDeadline)}</Tag>
              {job.requiredSkills.slice(0, 4).map((skill) => <Tag key={skill}>{skill}</Tag>)}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function PublicJobDetailPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [jobState, setJobState] = useState<{ isLoading: boolean; job: PublicJobPosting | null; error: string | null }>({
    isLoading: true,
    job: null,
    error: null,
  });
  const [submitState, setSubmitState] = useState<{ isSubmitting: boolean; success: boolean; error: string | null }>({
    isSubmitting: false,
    success: false,
    error: null,
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [form, setForm] = useState<PublicJobApplicationInput>({
    name: "",
    email: "",
    phone: "",
    location: "",
    currentTitle: "",
    yearsExperience: 0,
    seniority: "",
    topSkills: [],
    linkedinUrl: "",
    portfolioUrl: "",
    resumeOriginalFilename: "",
    coverNote: "",
    consent: false,
    idempotencyKey: crypto.randomUUID?.() ?? String(Date.now()),
  });
  const job = jobState.job;

  useEffect(() => {
    let active = true;
    if (!slug) {
      setJobState({ isLoading: false, job: null, error: "Job link is missing a public slug." });
      return () => {
        active = false;
      };
    }
    setJobState({ isLoading: true, job: null, error: null });
    platformApi.getPublicJobPosting(slug)
      .then((job) => {
        if (active) {
          setJobState({ isLoading: false, job, error: null });
          const refToken = searchParams.get("ref")?.trim() || undefined;
          void platformApi.recordPublicJobView(slug, { refToken });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setJobState({ isLoading: false, job: null, error: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [searchParams, slug]);

  function update<K extends keyof PublicJobApplicationInput>(key: K, value: PublicJobApplicationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleResumeChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSubmitState((current) => ({ ...current, error: null }));
    if (!file) {
      setResumeFile(null);
      update("resumeOriginalFilename", "");
      return;
    }
    if (!isAllowedResumeFile(file)) {
      event.target.value = "";
      setResumeFile(null);
      update("resumeOriginalFilename", "");
      setSubmitState({ isSubmitting: false, success: false, error: "Upload a PDF, DOCX, or TXT CV." });
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      event.target.value = "";
      setResumeFile(null);
      update("resumeOriginalFilename", "");
      setSubmitState({ isSubmitting: false, success: false, error: "CV upload must be 10 MB or smaller." });
      return;
    }
    setResumeFile(file);
    update("resumeOriginalFilename", file.name);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!slug) {
      return;
    }
    if (!resumeFile) {
      setSubmitState({ isSubmitting: false, success: false, error: "Upload your CV before submitting." });
      return;
    }
    if (!form.currentTitle?.trim()) {
      setSubmitState({ isSubmitting: false, success: false, error: "Add your current title before submitting." });
      return;
    }
    if (!form.topSkills?.length) {
      setSubmitState({ isSubmitting: false, success: false, error: "Add at least one skill before submitting." });
      return;
    }
    setSubmitState({ isSubmitting: true, success: false, error: null });
    try {
      const resumePayload = {
        fileName: resumeFile.name,
        contentType: resumeFile.type || "application/octet-stream",
        sizeBytes: resumeFile.size,
        base64: await fileToBase64(resumeFile),
      };
      await platformApi.submitPublicJobApplication(slug, { ...form, resumeFile: resumePayload });
      setSubmitState({ isSubmitting: false, success: true, error: null });
    } catch (error) {
      setSubmitState({ isSubmitting: false, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (jobState.isLoading) {
    return (
      <main className="public-jobs-page">
        <EmptyState title="Loading role" detail="Fetching the public job details." />
      </main>
    );
  }

  if (!job) {
    return (
      <main className="public-jobs-page">
        {jobState.error ? <div className="status-banner">{jobState.error}</div> : null}
        <EmptyState title="Role not available" detail={jobState.error ?? "This public job is not available."} />
      </main>
    );
  }

  return (
    <main className="public-jobs-page">
      <Link className="button button--secondary button--compact" to="/careers">
        <ArrowLeft size={16} />
        Back
      </Link>

      <section className="public-job-detail">
        <div className="public-job-detail__copy">
          <span className="eyebrow">Open role</span>
          <h1>{job.title}</h1>
          <p>{job.summary}</p>
          <div className="meta-list">
            <Tag><BriefcaseBusiness size={14} />{job.employmentType}</Tag>
            <Tag>{job.seniorityLevel}</Tag>
            <Tag>{job.location || "Location flexible"}</Tag>
            <Tag>Deadline {formatPublicDate(job.applicationDeadline)}</Tag>
          </div>
          <p>{job.description}</p>
          {job.keyResponsibilities.length ? (
            <ul className="public-job-listing">
              {job.keyResponsibilities.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </div>

        <Panel className="public-apply-panel">
          {submitState.success ? (
            <div className="public-apply-success">
              <CheckCircle2 size={28} />
              <h2>Application received</h2>
              <p>Thanks for applying. Your profile is now in the candidate pool, and your CV is queued for enrichment.</p>
            </div>
          ) : (
            <form className="job-editor" onSubmit={handleSubmit}>
              <h2>Apply</h2>
              {submitState.error ? <div className="status-banner">{submitState.error}</div> : null}
              <label className="parser-field">
                <span>Name</span>
                <input className="form-input" value={form.name} onChange={(event) => update("name", event.target.value)} required />
              </label>
              <label className="parser-field">
                <span>Email</span>
                <input className="form-input" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required />
              </label>
              <label className="parser-field">
                <span>Phone</span>
                <input className="form-input" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
              </label>
              <label className="parser-field">
                <span>Location</span>
                <input className="form-input" value={form.location} onChange={(event) => update("location", event.target.value)} />
              </label>
              <label className="parser-field">
                <span>Current title</span>
                <input className="form-input" value={form.currentTitle} onChange={(event) => update("currentTitle", event.target.value)} required />
              </label>
              <label className="parser-field">
                <span>Years experience</span>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="80"
                  step="0.5"
                  value={form.yearsExperience ?? 0}
                  onChange={(event) => update("yearsExperience", Number(event.target.value))}
                  required
                />
              </label>
              <label className="parser-field">
                <span>Seniority</span>
                <select className="form-select" value={form.seniority} onChange={(event) => update("seniority", event.target.value)} required>
                  <option value="">Select seniority</option>
                  {seniorityOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="parser-field">
                <span>Top skills</span>
                <input
                  className="form-input"
                  value={form.topSkills?.join(", ") ?? ""}
                  onChange={(event) => update("topSkills", event.target.value.split(/[,;\n]/).map((skill) => skill.trim()).filter(Boolean))}
                  placeholder="React, TypeScript, GraphQL"
                  required
                />
              </label>
              <label className="parser-field">
                <span>LinkedIn</span>
                <input className="form-input" value={form.linkedinUrl} onChange={(event) => update("linkedinUrl", event.target.value)} />
              </label>
              <label className="parser-field">
                <span>CV upload</span>
                <input className="form-input" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={handleResumeChange} required />
              </label>
              <label className="parser-field">
                <span>Note</span>
                <textarea className="form-textarea" value={form.coverNote} onChange={(event) => update("coverNote", event.target.value)} />
              </label>
              <label className="job-public-settings__toggle">
                <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} required />
                <span>I consent to storing my application for recruiting review.</span>
              </label>
              <button className="button button--primary" type="submit" disabled={!job.applyEnabled || submitState.isSubmitting}>
                <Send size={16} />
                {submitState.isSubmitting ? "Submitting" : "Submit application"}
              </button>
            </form>
          )}
        </Panel>
      </section>
    </main>
  );
}
