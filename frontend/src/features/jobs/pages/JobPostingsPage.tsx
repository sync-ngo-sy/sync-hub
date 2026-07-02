// frontend/src/features/jobs/pages/JobPostingsPage.tsx

import { useMemo, useState, useRef, useEffect } from "react";
import { Edit3, ExternalLink, Eye, Plus, Search, LayoutGrid, List, ChevronUp } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { Panel, Tag } from "@/components/ui";
import type { JobPostingStatus } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { formatDate, locationLabel, publicJobHref, statusTone } from "@/features/jobs/jobPresentation";
import statusIcon from "@/assets/status.svg";
import checkIcon from "@/assets/check.svg";
import draftIcon from "@/assets/draft.svg";
import languageIcon from "@/assets/language.svg";

type JobStatusFilter = "all" | JobPostingStatus;
type JobSortOption = "date-desc" | "date-asc" | "title-asc" | "title-desc" | "status";
type ViewMode = "card" | "table";

const STATUS_OPTIONS: { value: JobStatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
];

const SORT_OPTIONS = [
  { value: "date-desc", label: "Newest First" },
  { value: "date-asc", label: "Oldest First" },
  { value: "title-asc", label: "Title A-Z" },
  { value: "title-desc", label: "Title Z-A" },
  { value: "status", label: "By Status" },
] as const;

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
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem("jobs-view-mode") as ViewMode) || "card"
  );
  const [sortBy, setSortBy] = useState<JobSortOption>("date-desc");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredAndSortedJobs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const filtered = jobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (!query) return true;
      return [
        job.title, job.employerName, job.employerCountry, job.employerRegion,
        job.seniorityLevel, job.employmentType, locationLabel(job),
        ...job.requiredSkills, ...job.preferredSkills,
      ].filter(Boolean).join(" ").toLowerCase().includes(query);
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "date-asc": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "title-asc": return a.title.localeCompare(b.title);
        case "title-desc": return b.title.localeCompare(a.title);
        case "status": return a.status.localeCompare(b.status);
        case "date-desc":
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [jobs, searchTerm, statusFilter, sortBy]);

  const totalCount = jobs.length;
  const activeCount = jobs.filter((job) => job.status === "active").length;
  const publicCount = jobs.filter((job) => job.isPublic).length;
  const draftCount = jobs.filter((job) => job.status === "draft").length;
  const hasResults = filteredAndSortedJobs.length > 0;

  const currentSortLabel = SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label || "Newest First";
  const currentStatusLabel = STATUS_OPTIONS.find((opt) => opt.value === statusFilter)?.label || "All Statuses";

  const handleViewToggle = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("jobs-view-mode", mode);
  };

  return (
    <div className="page-stack">
      {/* Scope Controls */}
      <div className="flex items-center justify-end mb-4 px-2">
        <PlatformScopeControl
          isPlatformAdmin={isPlatformAdmin}
          scopeMode={scopeMode}
          currentWorkspace={currentWorkspace}
          workspaceOptions={workspaceOptions}
          onChangeScopeMode={setScopeMode}
          onChangeWorkspace={setWorkspaceId}
        />
      </div>

      {isAllScope && (
        <div className="status-banner mb-4">Create and save actions use the currently selected workspace.</div>
      )}

      {/* Unified Command Panel */}
      <form className="search-console-form relative z-0 outline-none focus:outline-none focus:ring-0">
        <Panel className="search-command-panel !border-none !z-0 outline-none focus:outline-none focus:ring-0">
          <div
            className="w-full py-4 flex items-center justify-between gap-4"
          >
            {/* FILTER CHIPS - Vertically Centered */}
            <div className="shrink-0 flex items-center gap-2 h-10 mt-4">
              {/* Status Chip - Always selected */}
              <div ref={statusDropdownRef} className="relative h-full">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsStatusOpen(!isStatusOpen)}
                  className="h-full px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none flex items-center justify-center gap-2 bg-[var(--primary)] text-[#39393a]"
                >
                  <img
                    src={statusIcon}
                    alt=""
                    width={16}
                    height={16}
                    className="transition-all duration-200"
                    style={{
                      display: "block",
                      filter: "brightness(0) saturate(100%) opacity(0.8)"
                    }}
                  />
                  <span className="flex items-center gap-1.5 leading-none font-normal">
                    Status • {currentStatusLabel}
                  </span>
                </div>
                {isStatusOpen && (
                  <div className="absolute top-12 left-0 z-50 bg-[#303031] border border-[var(--border)] rounded-xl p-2 min-w-[180px]">
                    {STATUS_OPTIONS.map((option) => (
                      <div
                        key={option.value}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setStatusFilter(option.value); setIsStatusOpen(false); }}
                        className={`px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                          statusFilter === option.value ? "bg-[var(--primary)] text-[#39393a]" : "text-[var(--text-muted)] hover:bg-[#282829] hover:text-[var(--text)]"
                        }`}
                      >
                        {option.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Stat Chips */}
              <div className="h-full px-4 rounded-full text-sm font-normal tracking-wide select-none border-0 outline-none flex items-center justify-center gap-2 bg-[var(--border)] text-[var(--text-muted)]">
                <span className="leading-none font-normal">Total • {totalCount}</span>
              </div>
              <div className="h-full px-4 rounded-full text-sm font-normal tracking-wide select-none border-0 outline-none flex items-center justify-center gap-2 bg-[var(--border)] text-[var(--text-muted)]">
                <img
                  src={checkIcon}
                  alt=""
                  width={16}
                  height={16}
                  className="transition-all duration-200"
                  style={{ display: "block", opacity: 0.7 }}
                />
                <span className="leading-none font-normal">Active • {activeCount}</span>
              </div>
              <div className="h-full px-4 rounded-full text-sm font-normal tracking-wide select-none border-0 outline-none flex items-center justify-center gap-2 bg-[var(--border)] text-[var(--text-muted)]">
                <img
                  src={draftIcon}
                  alt=""
                  width={16}
                  height={16}
                  className="transition-all duration-200"
                  style={{ display: "block", opacity: 0.7 }}
                />
                <span className="leading-none font-normal">Drafts • {draftCount}</span>
              </div>
              <div className="h-full px-4 rounded-full text-sm font-normal tracking-wide select-none border-0 outline-none flex items-center justify-center gap-2 bg-[var(--border)] text-[var(--text-muted)]">
                <img
                  src={languageIcon}
                  alt=""
                  width={16}
                  height={16}
                  className="transition-all duration-200"
                  style={{ display: "block", opacity: 0.7 }}
                />
                <span className="leading-none font-normal">Public • {publicCount}</span>
              </div>
            </div>

            {/* RIGHT INPUTS - Vertically Centered */}
            <div className="flex-1 flex items-center justify-end gap-2 h-10 mt-4">
              <label className="search-field h-full flex-1 max-w-[360px] transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 outline-none">
                <Search size={18} className="opacity-70 shrink-0 text-[var(--text-muted)]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Title, skill, employeer.."
                  className="bg-transparent border-none outline-none w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] p-0 h-full"
                />
              </label>

              <Link
                className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-full whitespace-nowrap overflow-hidden bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer transition-all duration-300"
                to="/jobs/new"
              >
                <Plus size={16} className="shrink-0" />
                <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">New Job</span>
              </Link>
            </div>
          </div>

          {/* SMOOTHLY EXPANDING SUMMARY BAR */}
          <div
            style={{
              height: hasResults || jobsQuery.isLoading ? "auto" : "0px",
              opacity: hasResults || jobsQuery.isLoading ? 1 : 0,
              overflow: "visible",
              transition: "height 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms ease-in-out",
            }}
            className="w-full relative z-10"
          >
            <div style={{ borderTop: "1.5px solid var(--border-strong)" }} className="pt-4 flex flex-col gap-3 pb-2">
              <div className="flex items-center justify-between w-full relative h-10">
                <div className="text-[17px] ml-2 md:text-[19px] font-normal text-[var(--text)] select-none">
                  {jobsQuery.isLoading ? "Loading postings..." : `${filteredAndSortedJobs.length} Job Postings`}
                </div>

                {/* Custom Sort Expander */}
                <div ref={sortDropdownRef} className="relative shrink-0 w-[280px] h-10 z-50">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!isSortOpen) setIsSortOpen(true); }}
                    className="absolute right-0 top-0 h-10 border rounded-xl bg-[#303031] flex items-center overflow-hidden transition-all duration-300 ease-in-out cursor-pointer select-none"
                    style={{
                      borderColor: "var(--border)",
                      width: isSortOpen ? "660px" : "280px",
                      maxWidth: "calc(100vw - 2rem)"
                    }}
                  >
                    <div
                      className="absolute left-4 flex items-center justify-between pointer-events-none transition-all duration-300"
                      style={{
                        opacity: isSortOpen ? 0 : 1,
                        transform: isSortOpen ? "translateX(-20px)" : "translateX(0)",
                        width: "calc(100% - 3.5rem)",
                        visibility: isSortOpen ? "hidden" : "visible",
                      }}
                    >
                      <span className="text-[15px] font-normal text-[var(--text-muted)]">Sort by</span>
                      <span className="text-[15px] text-[var(--text)] font-normal truncate max-w-[170px] mr-1">{currentSortLabel}</span>
                    </div>

                    <div
                      className="flex items-center gap-2 flex-1 min-w-0 pl-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{
                        opacity: isSortOpen ? 1 : 0,
                        transform: isSortOpen ? "translateX(0)" : "translateX(60px)",
                        pointerEvents: isSortOpen ? "auto" : "none",
                        visibility: isSortOpen ? "visible" : "hidden",
                      }}
                    >
                      {SORT_OPTIONS.map((option) => (
                        <div
                          key={option.value}
                          role="button"
                          tabIndex={isSortOpen ? 0 : -1}
                          onClick={(e) => { e.stopPropagation(); setSortBy(option.value); setIsSortOpen(false); }}
                          className={`px-3.5 py-1 rounded-full text-[15px] transition-colors duration-150 whitespace-nowrap cursor-pointer font-normal shrink-0 ${
                            sortBy === option.value ? "bg-[var(--primary)] text-[#39393a]" : "text-[var(--text-muted)] hover:bg-[#282829] hover:text-[var(--text)]"
                          }`}
                        >
                          {option.label}
                        </div>
                      ))}
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setIsSortOpen(!isSortOpen); }}
                      className="w-10 h-10 rounded-full flex items-center justify-center mr-1 shrink-0 cursor-pointer absolute right-0"
                    >
                      <ChevronUp
                        size={18}
                        className="transition-transform duration-300 ease-in-out opacity-100 shrink-0 text-white"
                        style={{ transform: isSortOpen ? "rotate(90deg)" : "rotate(-90deg)" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* View Toggle Row */}
              <div className="flex items-center justify-between w-full relative z-0">
                <div className="flex items-center gap-2.5">
                  <div className="px-3 py-1 rounded-lg text-xs text-[var(--text-muted)] bg-[var(--border)] select-none">
                    {publicCount} Public
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-[280px]">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleViewToggle("card")}
                    className={`flex-1 rounded-xl text-[15px] tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none flex items-center justify-center gap-2 h-10 font-normal px-2 ${
                      viewMode === "card" ? "bg-[var(--primary)] text-[#39393a]" : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                    }`}
                  >
                    <LayoutGrid size={16} className="shrink-0" />
                    <span className="leading-none font-normal truncate">Card View</span>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleViewToggle("table")}
                    className={`flex-1 rounded-xl text-[15px] tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none flex items-center justify-center gap-2 h-10 font-normal px-2 ${
                      viewMode === "table" ? "bg-[var(--primary)] text-[#39393a]" : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                    }`}
                  >
                    <List size={16} className="shrink-0" />
                    <span className="leading-none font-normal truncate">Table View</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </form>

      {/* Error / Empty States */}
      {jobsQuery.error ? <div className="status-banner mt-4">{String(jobsQuery.error)}</div> : null}

      {!jobsQuery.isLoading && !jobsQuery.error && !jobs.length ? (
        <div className="flex items-center justify-center min-h-[60vh] p-4 mt-4">
          <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-2xl w-full text-center flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[var(--border)] flex items-center justify-center">
              <Plus size={28} className="text-[var(--text-muted)] opacity-70" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text)] m-0">Create Your First Job Posting</h2>
            <p className="text-[15px] text-[var(--text-muted)] m-0">
              Create internal employer roles, extract structured requirements, and launch candidate matching runs.
            </p>
            <div className="flex items-center gap-3">
              <Link
                to="/jobs/new"
                className="px-6 h-11 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center gap-2 select-none"
              >
                New Job
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {!jobsQuery.isLoading && !jobsQuery.error && jobs.length > 0 && filteredAndSortedJobs.length === 0 ? (
        <div className="flex items-center justify-center min-h-[60vh] p-4 mt-4">
          <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-2xl w-full text-center flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[var(--border)] flex items-center justify-center">
              <img src={statusIcon} alt="" width={28} height={28} className="opacity-70" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text)] m-0">No Matching Jobs</h2>
            <p className="text-[15px] text-[var(--text-muted)] m-0">
              Adjust the search text or status filter to see more postings.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}
                className="px-6 h-11 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center gap-2 select-none"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* DUAL VIEW AREA */}
      {jobsQuery.isLoading ? (
        <div className="job-table-loading mt-12">Loading job postings...</div>
      ) : hasResults ? (
        <div style={{ overflow: "hidden", position: "relative", marginTop: "1rem" }}>
          {/* CARD VIEW */}
          <div
            style={{
              position: viewMode === "card" ? "relative" : "absolute",
              top: 0, left: 0, width: "100%",
              opacity: viewMode === "card" ? 1 : 0,
              pointerEvents: viewMode === "card" ? "auto" : "none",
              transition: "opacity 220ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <div className="candidate-results">
              {filteredAndSortedJobs.map((job) => (
                <JobResultCard key={job.id} job={job} />
              ))}
            </div>
          </div>

          {/* TABLE VIEW */}
          <div
            style={{
              position: viewMode === "table" ? "relative" : "absolute",
              top: 0, left: 0, width: "100%",
              opacity: viewMode === "table" ? 1 : 0,
              pointerEvents: viewMode === "table" ? "auto" : "none",
              transition: "opacity 220ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <Panel className="job-list-panel mt-0">
              <div className="job-table-scroll">
                <table className="job-postings-table">
                  <thead>
                  <tr>
                    <th>Job</th><th>Employer</th><th>Region</th><th>Status</th><th>Public</th><th>Posted</th><th>Deadline</th><th>Skills</th><th aria-label="Actions" />
                  </tr>
                  </thead>
                  <tbody>
                  {filteredAndSortedJobs.map((job) => {
                    const publicHref = publicJobHref(job);
                    return (
                      <tr key={job.id}>
                        <td>
                          <Link className="job-table-title" to={`/jobs/${job.id}`}>
                            <strong>{job.title || "Untitled job"}</strong>
                            <span>{locationLabel(job)} · {job.employmentType || "Type missing"}</span>
                          </Link>
                        </td>
                        <td><strong>{job.employerName}</strong><span>{job.employerCountry}</span></td>
                        <td><Tag>{job.employerRegion}</Tag></td>
                        <td><Tag tone={statusTone(job.status)}>{job.status}</Tag></td>
                        <td>
                          <div className="job-public-cell">
                            <Tag tone={job.isPublic ? "success" : "neutral"}>{job.isPublic ? "public" : "internal"}</Tag>
                            {job.isPublic ? <span>{job.publicApplyEnabled ? "Apply open" : "Apply closed"}</span> : null}
                          </div>
                        </td>
                        <td>{formatDate(job.postedDate)}</td>
                        <td>{formatDate(job.applicationDeadline)}</td>
                        <td><span className="job-table-skills">{job.requiredSkills.slice(0, 3).join(", ") || "Missing"}</span></td>
                        <td>
                          <div className="job-table-actions">
                            <Link className="icon-button" to={`/jobs/${job.id}`} aria-label={`View ${job.title}`} title="View"><Eye size={16} /></Link>
                            <Link className="icon-button" to={`/jobs/${job.id}/edit`} aria-label={`Edit ${job.title}`} title="Edit"><Edit3 size={16} /></Link>
                            {publicHref ? (<a className="icon-button" href={publicHref} aria-label={`Open public page for ${job.title}`} title="Public page"><ExternalLink size={16} /></a>) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function JobResultCard({ job }: { job: any }) {
  const publicHref = publicJobHref(job);
  return (
    <Panel className="candidate-result-card !p-0 overflow-hidden flex flex-col relative group transition-all duration-300 hover:border-[var(--primary)]">
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link to={`/jobs/${job.id}`} className="text-lg font-semibold text-[var(--text)] hover:text-[var(--primary)] transition-colors truncate block">
              {job.title || "Untitled job"}
            </Link>
            <p className="text-sm text-[var(--text-muted)] mt-1 truncate">
              {job.employerName} · {locationLabel(job)}
            </p>
          </div>
          <Tag tone={statusTone(job.status)}>{job.status}</Tag>
        </div>

        <div className="meta-list mt-1">
          <Tag>{job.employerRegion}</Tag>
          <Tag>{job.employmentType || "Type missing"}</Tag>
          <Tag>{job.seniorityLevel || "Seniority missing"}</Tag>
        </div>

        <div className="meta-list mt-1">
          {job.requiredSkills.slice(0, 4).map((skill: string) => (
            <Tag key={skill} tone="success">{skill}</Tag>
          ))}
          {job.requiredSkills.length > 4 && (
            <Tag>+{job.requiredSkills.length - 4} more</Tag>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-between bg-[var(--bg)] gap-2 mt-auto">
        <div className="text-xs text-[var(--text-muted)]">
          {formatDate(job.postedDate)} · Deadline {formatDate(job.applicationDeadline)}
        </div>
        <div className="flex items-center gap-1">
          <Link className="icon-button" to={`/jobs/${job.id}`} title="View"><Eye size={16} /></Link>
          <Link className="icon-button" to={`/jobs/${job.id}/edit`} title="Edit"><Edit3 size={16} /></Link>
          {publicHref && (
            <a className="icon-button" href={publicHref} title="Public Page"><ExternalLink size={16} /></a>
          )}
        </div>
      </div>
    </Panel>
  );
}
