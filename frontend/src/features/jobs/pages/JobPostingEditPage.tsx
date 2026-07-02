// frontend/src/features/jobs/pages/JobPostingEditPage.tsx

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Panel } from "@/components/ui";
import type { JobPostingStatus } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import {
  formFromJob,
  jobInputFromForm,
  validateJobForm,
  applyExtraction,
  employmentTypeOptions,
  regionOptions,
  seniorityOptions,
  splitList,
  type JobFormState,
} from "@/features/jobs/jobForm";
import { formatDate } from "@/features/jobs/jobPresentation";
import { mockJobPosting } from "@/features/jobs/jobMocks";
import { LocationSelectionModal } from "@/features/search/components/LocationSelectionModal";
import { getCleanCountry, COUNTRY_MAP } from "@/features/search/utils/countryFlags";
import saveIcon from "@/assets/save.svg";
import checkIcon from "@/assets/check.svg";
import sparklesIcon from "@/assets/ai_outlined.svg";

type EditTab = "basics" | "requirements" | "publishing";

const TABS: { key: EditTab; label: string }[] = [
  { key: "basics", label: "Role Basics" },
  { key: "requirements", label: "Requirements" },
  { key: "publishing", label: "Publishing" },
];

// Capitalization helpers
const capWords = (val: string) => val.replace(/(^\w|\s\w)/g, (c) => c.toUpperCase());
const capFirst = (val: string) => val.charAt(0).toUpperCase() + val.slice(1);
const capListItems = (val: string) => val.replace(/(^\w|,\s*\w)/g, (c) => c.toUpperCase());

export function JobPostingEditPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isDummy = jobId === "dummy-job-id";

  const jobQuery = useQuery({
    queryKey: ["job-posting", jobId],
    queryFn: () =>
      isDummy ? Promise.resolve(mockJobPosting) : platformApi.getJobPosting(jobId ?? ""),
    enabled: Boolean(jobId),
  });
  const job = jobQuery.data;

  const [activeTab, setActiveTab] = useState<EditTab>("basics");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize form from job data
  const initialForm = useMemo(() => (job ? formFromJob(job) : null), [job]);
  const [form, setForm] = useState<JobFormState | null>(null);

  // Sync form when job data loads
  useEffect(() => {
    if (initialForm && !form) {
      setForm(initialForm);
    }
  }, [initialForm, form]);

  // Country Modal States
  const [isEmployerCountryModalOpen, setIsEmployerCountryModalOpen] = useState(false);
  const [isEmployerCountryAnimating, setIsEmployerCountryAnimating] = useState(false);
  const [isJobCountryModalOpen, setIsJobCountryModalOpen] = useState(false);
  const [isJobCountryAnimating, setIsJobCountryAnimating] = useState(false);

  // Deadline States
  const [deadlineDay, setDeadlineDay] = useState("");
  const [deadlineMonth, setDeadlineMonth] = useState("");
  const [deadlineYear, setDeadlineYear] = useState("");
  const [deadlineError, setDeadlineError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const allCountriesFilterOptions = useMemo(() => {
    const locations = Object.values(COUNTRY_MAP)
      .filter((c) => c.name !== "Any Place")
      .map((c) => c.name);
    return { locations, seniority: [], skills: [], companies: [] };
  }, []);

  // Parse deadline from form
  useEffect(() => {
    if (form?.applicationDeadline) {
      const parts = form.applicationDeadline.split("-");
      if (parts.length === 3) {
        setDeadlineYear(parts[0]);
        setDeadlineMonth(String(parseInt(parts[1], 10)));
        setDeadlineDay(String(parseInt(parts[2], 10)));
      }
    } else {
      setDeadlineDay("");
      setDeadlineMonth("");
      setDeadlineYear("");
    }
  }, [form?.applicationDeadline]);

  const handleDeadlineChange = (newDay: string, newMonth: string, newYear: string) => {
    setDeadlineDay(newDay);
    setDeadlineMonth(newMonth);
    setDeadlineYear(newYear);
    setDeadlineError(null);

    const d = parseInt(newDay, 10);
    const m = parseInt(newMonth, 10);
    const y = parseInt(newYear, 10);

    if (newMonth.length === 2 && (isNaN(m) || m < 1 || m > 12)) {
      setDeadlineError("Month must be between 01 and 12.");
      update("applicationDeadline", "");
      return;
    }
    if (newYear.length === 4 && (isNaN(y) || y < currentYear)) {
      setDeadlineError(`Year must be ${currentYear} or later.`);
      update("applicationDeadline", "");
      return;
    }

    if (newDay.length > 0 && newMonth.length > 0 && newYear.length === 4) {
      if (isNaN(d) || isNaN(m) || isNaN(y)) {
        setDeadlineError("Please enter valid numbers.");
        update("applicationDeadline", "");
        return;
      }
      if (m < 1 || m > 12) {
        setDeadlineError("Month must be between 01 and 12.");
        update("applicationDeadline", "");
        return;
      }
      if (y < currentYear) {
        setDeadlineError(`Year must be ${currentYear} or later.`);
        update("applicationDeadline", "");
        return;
      }
      const maxDays = new Date(y, m, 0).getDate();
      if (d < 1 || d > maxDays) {
        setDeadlineError(`Day must be between 01 and ${maxDays} for this month.`);
        update("applicationDeadline", "");
        return;
      }

      const formattedDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      update("applicationDeadline", formattedDate);
    } else {
      update("applicationDeadline", "");
    }
  };

  const saveMutation = useMutation({
    mutationFn: (status: JobPostingStatus) =>
      platformApi.saveJobPosting(jobInputFromForm(form!, status)),
    onSuccess: (savedJob) => {
      setNotice(
        savedJob.status === "active"
          ? "Job is active and ready for matching."
          : "Draft saved."
      );
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["job-postings"] });
      void queryClient.invalidateQueries({ queryKey: ["job-posting", savedJob.id] });
      setTimeout(() => navigate(`/jobs/${savedJob.id}`), 800);
    },
    onError: (err) => {
      setError(
        err instanceof Error ? err.message : "Unable to save job posting."
      );
      setNotice(null);
    },
  });

  const extractMutation = useMutation({
    mutationFn: () =>
      platformApi.extractJobPosting({
        tenantId: form!.tenantId,
        jobId: form!.id,
        title: form!.title,
        employerRegion: form!.employerRegion,
        jobDescription: form!.jobDescription,
      }),
    onSuccess: (result) => {
      setForm((current) => (current ? applyExtraction(current, result) : current));
      setNotice("AI extraction applied. Review the fields before publishing.");
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to extract this job description."
      );
    },
  });

  const update = <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const handleSave = (status: JobPostingStatus) => {
    if (!form) return;
    const missing = validateJobForm(form, status);
    if (missing.length) {
      setError(
        `Add ${missing.join(", ")} before saving this job${status === "active" ? " as active" : ""}.`
      );
      setNotice(null);
      return;
    }
    saveMutation.mutate(status);
  };

  const handleDivKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    action: () => void
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  const openModal = (type: "employer" | "job") => {
    if (type === "employer") {
      setIsEmployerCountryModalOpen(true);
      requestAnimationFrame(() => setIsEmployerCountryAnimating(true));
    } else {
      setIsJobCountryModalOpen(true);
      requestAnimationFrame(() => setIsJobCountryAnimating(true));
    }
  };

  const closeModal = (type: "employer" | "job") => {
    if (type === "employer") {
      setIsEmployerCountryAnimating(false);
      setTimeout(() => setIsEmployerCountryModalOpen(false), 300);
    } else {
      setIsJobCountryAnimating(false);
      setTimeout(() => setIsJobCountryModalOpen(false), 300);
    }
  };

  // ── Error state ──────────────────────────────────────────────
  if (jobQuery.error) {
    return (
      <div className="page-stack flex items-center justify-center min-h-[60vh] p-4">
        <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-2xl w-full text-center flex flex-col items-center gap-6 shadow-[var(--shadow)]">
          <h2 className="text-2xl font-bold text-[var(--text)] m-0">
            Unable to load job
          </h2>
          <p className="text-[15px] text-[var(--text-muted)] m-0">
            {String(jobQuery.error)}
          </p>
          <Link
            to="/jobs"
            className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)] cursor-pointer no-underline"
          >
            <ArrowLeft size={16} />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
              Back to Jobs
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // Loading state
  if (jobQuery.isLoading || !job || !form) {
    return (
      <div className="page-stack flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-muted)]">Loading job for editing...</div>
      </div>
    );
  }

  // Main render
  return (
    <div className="page-stack" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-4">
          <Link
            to={`/jobs/${job.id}`}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer transition-all duration-300 no-underline"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              Edit Job Posting
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {job.title || "Untitled job"} · {job.employerName} · Updated{" "}
              {formatDate(job.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            role="button"
            tabIndex={saveMutation.isPending ? -1 : 0}
            onClick={
              saveMutation.isPending ? undefined : () => handleSave("draft")
            }
            onKeyDown={(e) => handleDivKeyDown(e, () => handleSave("draft"))}
            className={`group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0
              ${
              saveMutation.isPending
                ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60 [--icon-filter=brightness(0)_saturate(100%)_invert(91%)_sepia(5%)_saturate(702%)_hue-rotate(124deg)_opacity(0.8)]"
                : "bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)] cursor-pointer [--icon-filter=brightness(0)_invert(1)_opacity(0.7)] hover:[--icon-filter=brightness(0)_invert(1)]"
            }`}
            style={{
              boxSizing: "border-box",
              transition:
                "background-color 300ms ease-in-out, color 300ms ease-in-out",
            }}
          >
            <img
              src={saveIcon}
              alt=""
              width={16}
              height={16}
              className="transition-all duration-300 ease-in-out shrink-0"
              style={{ display: "block", filter: "var(--icon-filter)" }}
            />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
              Save Draft
            </span>
          </div>

          <div
            role="button"
            tabIndex={saveMutation.isPending ? -1 : 0}
            onClick={
              saveMutation.isPending ? undefined : () => handleSave("active")
            }
            onKeyDown={(e) => handleDivKeyDown(e, () => handleSave("active"))}
            className={`group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0
              ${
              saveMutation.isPending
                ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60 [--icon-filter=brightness(0)_saturate(100%)_invert(91%)_sepia(5%)_saturate(702%)_hue-rotate(124deg)_opacity(0.8)]"
                : "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer [--icon-filter=brightness(0)_saturate(100%)_invert(21%)_sepia(3%)_saturate(137%)_hue-rotate(201deg)_opacity(0.8)] hover:[--icon-filter=brightness(0)_saturate(100%)_invert(100%)_sepia(10%)_saturate(151%)_hue-rotate(113deg)]"
            }`}
            style={{
              boxSizing: "border-box",
              transition:
                "background-color 300ms ease-in-out, color 300ms ease-in-out",
            }}
          >
            <img
              src={checkIcon}
              alt=""
              width={16}
              height={16}
              className="transition-all duration-300 ease-in-out shrink-0"
              style={{ display: "block", filter: "var(--icon-filter)" }}
            />
            <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
              Publish Active
            </span>
          </div>
        </div>
      </div>

      {/* Status banners */}
      {error && <div className="status-banner mb-4">{error}</div>}
      {notice && (
        <div className="status-banner mb-4 !bg-[var(--primary)]/10 !text-[var(--primary)] !border-[var(--primary)]/20">
          {notice}
        </div>
      )}

      <div className="page-stack gap-6">
        {/* Full Width Tab Navigation */}
        <div className="flex items-center gap-2 w-full">
          {TABS.map((tab) => (
            <div
              key={tab.key}
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveTab(tab.key);
                }
              }}
              className={`flex-1 rounded-xl text-[15px] tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 font-normal px-2
                ${
                activeTab === tab.key
                  ? "bg-[var(--primary)] text-[#39393a]"
                  : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <span className="leading-none font-normal truncate">
                {tab.label}
              </span>
            </div>
          ))}
        </div>

        {/* Tab Content */}
        <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
          <div className="p-6 min-h-[420px]">
            {/* ── TAB: Role Basics ──────────────────────────────── */}
            {activeTab === "basics" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Title <span className="text-red-400">*</span>
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <input
                      value={form.title}
                      onChange={(e) => update("title", capWords(e.target.value))}
                      placeholder="e.g. Senior React Developer"
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Employer name <span className="text-red-400">*</span>
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <input
                      value={form.employerName}
                      onChange={(e) =>
                        update("employerName", capWords(e.target.value))
                      }
                      placeholder="e.g. Tech Corp"
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Employer country <span className="text-red-400">*</span>
                  </span>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openModal("employer")}
                    onKeyDown={(e) =>
                      handleDivKeyDown(e, () => openModal("employer"))
                    }
                    className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none cursor-pointer"
                  >
                    <span
                      className={`flex-1 truncate ${
                        form.employerCountry
                          ? "text-[var(--text)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {form.employerCountry || "Select employer country"}
                    </span>
                    <div className="shrink-0">
                      {form.employerCountry &&
                      getCleanCountry(form.employerCountry).flagUrl ? (
                        <img
                          src={
                            getCleanCountry(form.employerCountry).flagUrl ||
                            "https://hatscripts.github.io/circle-flags/flags/xx.svg"
                          }
                          alt=""
                          width={20}
                          height={20}
                          className="rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://hatscripts.github.io/circle-flags/flags/xx.svg";
                          }}
                        />
                      ) : (
                        <Search
                          size={18}
                          className="opacity-70 text-[var(--text-muted)]"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Employer region
                  </span>
                  <div className="flex items-center gap-2 h-11">
                    {regionOptions.map((r) => (
                      <div
                        key={r}
                        role="button"
                        tabIndex={0}
                        onClick={() => update("employerRegion", r as any)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            update("employerRegion", r as any);
                          }
                        }}
                        className={`px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none flex items-center justify-center h-full ${
                          form.employerRegion === r
                            ? "bg-[var(--primary)] text-[#39393a]"
                            : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                        }`}
                      >
                        {r}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Job description <span className="text-red-400">*</span>
                  </span>
                  <label className="search-field h-auto w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-2xl pl-3.5 pr-5 py-3 relative flex items-start gap-2.5 outline-none">
                    <textarea
                      value={form.jobDescription}
                      onChange={(e) =>
                        update("jobDescription", capFirst(e.target.value))
                      }
                      placeholder="Paste the full job description here..."
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 min-h-[120px]"
                    />
                  </label>
                </div>

                <div className="md:col-span-2 flex justify-start mt-2">
                  <div
                    role="button"
                    tabIndex={
                      extractMutation.isPending ||
                      form.jobDescription.trim().length < 20
                        ? -1
                        : 0
                    }
                    onClick={() => {
                      if (
                        !extractMutation.isPending &&
                        form.jobDescription.trim().length >= 20
                      )
                        extractMutation.mutate();
                    }}
                    onKeyDown={(e) =>
                      handleDivKeyDown(e, () => {
                        if (
                          !extractMutation.isPending &&
                          form.jobDescription.trim().length >= 20
                        )
                          extractMutation.mutate();
                      })
                    }
                    className={`group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-11 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0
                      ${
                      extractMutation.isPending ||
                      form.jobDescription.trim().length < 20
                        ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60 [--icon-filter=brightness(0)_saturate(100%)_invert(91%)_sepia(5%)_saturate(702%)_hue-rotate(124deg)_opacity(0.8)]"
                        : "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer [--icon-filter=brightness(0)_saturate(100%)_invert(21%)_sepia(3%)_saturate(137%)_hue-rotate(201deg)_opacity(0.8)] hover:[--icon-filter=brightness(0)_saturate(100%)_invert(100%)_sepia(10%)_saturate(151%)_hue-rotate(113deg)]"
                    }`}
                    style={{
                      boxSizing: "border-box",
                      transition:
                        "background-color 300ms ease-in-out, color 300ms ease-in-out",
                    }}
                  >
                    <img
                      src={sparklesIcon}
                      alt=""
                      width={16}
                      height={16}
                      className="transition-all duration-300 ease-in-out shrink-0"
                      style={{ display: "block", filter: "var(--icon-filter)" }}
                    />
                    <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
                      {extractMutation.isPending
                        ? "Extracting.."
                        : "Extract from JD"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Requirements ─────────────────────────────── */}
            {activeTab === "requirements" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Required skills <span className="text-red-400">*</span>
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <input
                      value={form.requiredSkills}
                      onChange={(e) =>
                        update("requiredSkills", capListItems(e.target.value))
                      }
                      placeholder="React, TypeScript, REST APIs (separate by comma ,)"
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Preferred skills
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <input
                      value={form.preferredSkills}
                      onChange={(e) =>
                        update("preferredSkills", capListItems(e.target.value))
                      }
                      placeholder="Next.js, Banking domain (separate by comma ,)"
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Seniority level <span className="text-red-400">*</span>
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <select
                      value={form.seniorityLevel}
                      onChange={(e) => update("seniorityLevel", e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] p-0 h-full appearance-none cursor-pointer"
                    >
                      <option value="">Select seniority</option>
                      {seniorityOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Employment type <span className="text-red-400">*</span>
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <select
                      value={form.employmentType}
                      onChange={(e) => update("employmentType", e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] p-0 h-full appearance-none cursor-pointer"
                    >
                      <option value="">Select type</option>
                      {employmentTypeOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Deadline
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-2 relative flex items-center outline-none">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={deadlineDay}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          handleDeadlineChange(val, deadlineMonth, deadlineYear);
                        }}
                        placeholder="DD"
                        className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full text-center"
                      />
                    </label>
                    <span className="text-[var(--text-muted)] font-light text-lg">
                      /
                    </span>
                    <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-2 pr-2 relative flex items-center outline-none">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={deadlineMonth}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          handleDeadlineChange(deadlineDay, val, deadlineYear);
                        }}
                        placeholder="MM"
                        className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full text-center"
                      />
                    </label>
                    <span className="text-[var(--text-muted)] font-light text-lg">
                      /
                    </span>
                    <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-2 pr-3.5 relative flex items-center outline-none">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={deadlineYear}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          handleDeadlineChange(deadlineDay, deadlineMonth, val);
                        }}
                        placeholder="YYYY"
                        className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full text-center"
                      />
                    </label>
                  </div>
                  {deadlineError && (
                    <span className="text-xs text-red-400 pl-2">
                      {deadlineError}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Remote policy
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <select
                      value={form.remotePolicy}
                      onChange={(e) => update("remotePolicy", e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] p-0 h-full appearance-none cursor-pointer"
                    >
                      {["Unspecified", "Onsite", "Hybrid", "Remote"].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Job country
                  </span>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openModal("job")}
                    onKeyDown={(e) =>
                      handleDivKeyDown(e, () => openModal("job"))
                    }
                    className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none cursor-pointer"
                  >
                    <span
                      className={`flex-1 truncate ${
                        form.locationCountry
                          ? "text-[var(--text)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {form.locationCountry || "Select job country"}
                    </span>
                    <div className="shrink-0">
                      {form.locationCountry &&
                      getCleanCountry(form.locationCountry).flagUrl ? (
                        <img
                          src={
                            getCleanCountry(form.locationCountry).flagUrl ||
                            "https://hatscripts.github.io/circle-flags/flags/xx.svg"
                          }
                          alt=""
                          width={20}
                          height={20}
                          className="rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://hatscripts.github.io/circle-flags/flags/xx.svg";
                          }}
                        />
                      ) : (
                        <Search
                          size={18}
                          className="opacity-70 text-[var(--text-muted)]"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                    Job city
                  </span>
                  <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                    <input
                      value={form.locationCity}
                      onChange={(e) =>
                        update("locationCity", capWords(e.target.value))
                      }
                      placeholder="e.g. Dubai"
                      className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* ── TAB: Publishing ───────────────────────────────── */}
            {activeTab === "publishing" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                      Key responsibilities
                    </span>
                    <label className="search-field h-auto w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-2xl pl-3.5 pr-5 py-3 relative flex items-start gap-2.5 outline-none">
                      <textarea
                        value={form.keyResponsibilities}
                        onChange={(e) =>
                          update("keyResponsibilities", e.target.value)
                        }
                        placeholder="Key responsibilities"
                        className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 min-h-[100px]"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-[var(--border)] rounded-2xl">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={(e) => update("isPublic", e.target.checked)}
                      className="w-5 h-5 rounded accent-[var(--primary)]"
                    />
                    <div>
                      <span className="text-[var(--text)] font-medium block">
                        Public application page
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Make this job visible to outside candidates
                      </span>
                    </div>
                  </label>
                </div>

                {form.isPublic && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                        Public slug <span className="text-red-400">*</span>
                      </span>
                      <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                        <input
                          value={form.publicSlug}
                          onChange={(e) => update("publicSlug", e.target.value)}
                          placeholder="senior-react-developer-dubai"
                          className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                        Public title
                      </span>
                      <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                        <input
                          value={form.publicTitle}
                          onChange={(e) =>
                            update("publicTitle", capWords(e.target.value))
                          }
                          placeholder={form.title || "Public job title"}
                          className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                        Public location
                      </span>
                      <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                        <input
                          value={form.publicLocation}
                          onChange={(e) =>
                            update("publicLocation", capWords(e.target.value))
                          }
                          placeholder="Dubai, UAE"
                          className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                        Applications
                      </span>
                      <div className="flex items-center gap-2 h-11">
                        {["Open", "Closed"].map((opt) => (
                          <div
                            key={opt}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              update("publicApplyEnabled", opt === "Open")
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                update("publicApplyEnabled", opt === "Open");
                              }
                            }}
                            className={`px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none flex items-center justify-center h-full ${
                              form.publicApplyEnabled === (opt === "Open")
                                ? "bg-[var(--primary)] text-[#39393a]"
                                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                            }`}
                          >
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                        Public summary
                      </span>
                      <label className="search-field h-11 w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                        <input
                          value={form.publicSummary}
                          onChange={(e) =>
                            update("publicSummary", e.target.value)
                          }
                          placeholder="Short candidate-facing summary"
                          className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                        Redacted public description{" "}
                        <span className="text-red-400">*</span>
                      </span>
                      <label className="search-field h-auto w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-2xl pl-3.5 pr-5 py-3 relative flex items-start gap-2.5 outline-none">
                        <textarea
                          value={form.publicDescription}
                          onChange={(e) =>
                            update(
                              "publicDescription",
                              capFirst(e.target.value)
                            )
                          }
                          placeholder="Redacted public description"
                          className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 min-h-[100px]"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Employer Country Modal */}
      <LocationSelectionModal
        isOpen={isEmployerCountryModalOpen}
        isAnimating={isEmployerCountryAnimating}
        onClose={() => closeModal("employer")}
        location={form.employerCountry}
        onSetLocation={(val) => {
          update("employerCountry", val);
          closeModal("employer");
        }}
        filterOptions={allCountriesFilterOptions}
        hideAnyPlace={true}
      />

      {/* Job Country Modal */}
      <LocationSelectionModal
        isOpen={isJobCountryModalOpen}
        isAnimating={isJobCountryAnimating}
        onClose={() => closeModal("job")}
        location={form.locationCountry}
        onSetLocation={(val) => {
          update("locationCountry", val);
          closeModal("job");
        }}
        filterOptions={allCountriesFilterOptions}
        hideAnyPlace={false}
      />
    </div>
  );
}
