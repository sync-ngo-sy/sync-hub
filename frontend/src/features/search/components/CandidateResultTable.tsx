import { useState } from "react";
import { BookmarkCheck, BookmarkPlus, Eye, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, Panel, Tag } from "@/components/ui";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";
import { shortlistKey } from "@/features/search/searchState";

import aiOutlinedIcon from "../../../../src/assets/ai_outlined.svg";
import aiFilledIcon from "../../../../src/assets/ai_filled.svg";
import checkIcon from "../../../../src/assets/check.svg";

type SortField = "name" | "score" | "experience" | "location" | "seniority";
type SortDir = "asc" | "desc";

type CandidateResultTableProps = {
  candidates: CandidateSearchResult[];
  shortlistKeys: Set<string>;
  shortlistPendingIds: Set<string>;
  resolveCandidateTenantId: (candidate: CandidateSearchResult) => string | null;
  partnerId?: string | null;
  searchQuery: string;
  workspaceLabel?: string | null;
  onPreview: (candidate: CandidateSearchResult) => void;
  onToggleShortlist: (candidate: CandidateSearchResult) => void;
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
};

function capitalize(str?: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function SortIcon({ field, active, dir }: { field: SortField; active: SortField; dir: SortDir }) {
  if (field !== active)
    return <ArrowUpDown size={12} className="opacity-30 group-hover:opacity-60 transition-opacity shrink-0" />;
  return dir === "asc"
    ? <ArrowUp size={12} className="text-[var(--primary)] shrink-0" />
    : <ArrowDown size={12} className="text-[var(--primary)] shrink-0" />;
}

function MatchCell({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-[var(--text-muted)]">—</span>;
  const pct = Math.round(score);
  let color = "var(--text-muted)";
  if (pct >= 80) color = "var(--primary)";
  else if (pct >= 60) color = "var(--text)";
  return (
    <span className="text-[14px] font-semibold tabular-nums" style={{ color }}>
      {pct}%
    </span>
  );
}

const ICON_ACTION =
  "w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--border)] hover:bg-[var(--border-strong)] cursor-pointer transition-colors duration-150 outline-none focus:outline-none";

export function CandidateResultTable({
                                       candidates,
                                       shortlistKeys,
                                       shortlistPendingIds,
                                       resolveCandidateTenantId,
                                       partnerId,
                                       searchQuery,
                                       workspaceLabel,
                                       onPreview,
                                       onToggleShortlist,
                                       selectedIds,
                                       onSelectionChange,
                                     }: CandidateResultTableProps) {
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hoveredAiId, setHoveredAiId] = useState<string | null>(null);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleToggleSelect(candidateId: string) {
    const next = new Set(selectedIds);
    if (next.has(candidateId)) {
      next.delete(candidateId);
    } else {
      if (next.size >= 3) return;
      next.add(candidateId);
    }
    onSelectionChange(next);
  }

  const sorted = [...candidates].sort((a, b) => {
    let va: string | number = "";
    let vb: string | number = "";
    switch (sortField) {
      case "name":       va = a.name.toLowerCase();               vb = b.name.toLowerCase();               break;
      case "score":      va = a.backendMatchRate ?? 0;            vb = b.backendMatchRate ?? 0;            break;
      case "experience": va = a.yearsExperience ?? 0;             vb = b.yearsExperience ?? 0;             break;
      case "location":   va = (a.location ?? "").toLowerCase();   vb = (b.location ?? "").toLowerCase();   break;
      case "seniority":  va = (a.seniority ?? "").toLowerCase();  vb = (b.seniority ?? "").toLowerCase();  break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const tdPad: React.CSSProperties = {
    paddingTop: "20px",
    paddingBottom: "20px",
    paddingLeft: "14px",
    paddingRight: "14px",
    verticalAlign: "middle",
  };

  const tdCenter: React.CSSProperties = {
    ...tdPad,
    textAlign: "center",
  };

  const thCenter: React.CSSProperties = {
    textAlign: "center",
    verticalAlign: "middle",
  };

  const getCircleStyle = (isSelected: boolean, canSelect: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 150ms ease-in-out",
    };

    if (isSelected) {
      return {
        ...base,
        backgroundColor: "var(--primary, #3b82f6)",
        border: "2px solid var(--primary, #3b82f6)",
        transform: "scale(1.1)",
      };
    }

    if (!canSelect) {
      return {
        ...base,
        border: "2px solid var(--border-strong, #4b5563)",
        opacity: 0.15,
        cursor: "not-allowed",
        backgroundColor: "transparent",
      };
    }

    return {
      ...base,
      border: "2px solid var(--text-muted, #718096)",
      backgroundColor: "transparent",
      cursor: "pointer",
    };
  };

  const cellHover = "group-hover/row:bg-[var(--surface-raised)] transition-colors duration-150";

  return (
    <Panel className="table-card candidate-list-panel">
      <div className="candidate-list-table-scroll" style={{ paddingLeft: "12px", paddingRight: "12px" }}>
        <table
          className="candidate-list-table"
          style={{ borderCollapse: "separate", borderSpacing: "0 10px" }}
        >
          <thead>
          <tr>
            <th style={{ width: "45px", verticalAlign: "middle" }} />

            <th
              onClick={() => handleSort("name")}
              className="group cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150"
              style={{ verticalAlign: "middle" }}
            >
                <span className="flex items-center gap-1.5">
                  Candidate
                  <SortIcon field="name" active={sortField} dir={sortDir} />
                </span>
            </th>

            <th
              onClick={() => handleSort("score")}
              className="group cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150"
              style={thCenter}
            >
                <span className="inline-flex items-center gap-1.5">
                  Match
                  <SortIcon field="score" active={sortField} dir={sortDir} />
                </span>
            </th>

            <th
              onClick={() => handleSort("experience")}
              className="group cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150"
              style={thCenter}
            >
                <span className="inline-flex items-center gap-1.5">
                  Experience
                  <SortIcon field="experience" active={sortField} dir={sortDir} />
                </span>
            </th>

            <th
              onClick={() => handleSort("seniority")}
              className="group cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150"
              style={thCenter}
            >
                <span className="inline-flex items-center gap-1.5">
                  Seniority
                  <SortIcon field="seniority" active={sortField} dir={sortDir} />
                </span>
            </th>

            <th
              onClick={() => handleSort("location")}
              className="group cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150"
              style={thCenter}
            >
                <span className="inline-flex items-center gap-1.5">
                  Location
                  <SortIcon field="location" active={sortField} dir={sortDir} />
                </span>
            </th>

            <th style={thCenter}>Top Skills</th>
            <th style={thCenter}>Actions</th>
          </tr>
          </thead>

          <tbody>
          {sorted.map((c, idx) => {
            const tenantId = resolveCandidateTenantId(c);
            const candidateShortlistKey = tenantId ? shortlistKey(tenantId, c.candidateId) : "";
            const isShortlisted = candidateShortlistKey ? shortlistKeys.has(candidateShortlistKey) : false;
            const shortlistPending = shortlistPendingIds.has(c.candidateId);
            const isAiHovered = hoveredAiId === c.candidateId;
            const isLast = idx === sorted.length - 1;
            const noBorder = isLast ? { borderBottom: "none" } : {};

            const isCandidateSelected = selectedIds.has(c.candidateId);
            const isLimitReached = selectedIds.size >= 3;
            const canSelect = isCandidateSelected || !isLimitReached;

            return (
              <tr
                key={c.candidateId}
                className="group/row cursor-pointer"
                onClick={() => onPreview(c)}
              >
                <td
                  style={{ ...tdCenter, ...noBorder, width: "45px" }}
                  className={`${cellHover} rounded-l-xl`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canSelect) {
                      handleToggleSelect(c.candidateId);
                    }
                  }}
                >
                  <div className="flex items-center justify-center">
                    <div style={getCircleStyle(isCandidateSelected, canSelect)}>
                      {isCandidateSelected && (
                        <img
                          src={checkIcon}
                          alt="Selected"
                          className="w-2.5 h-2.5 shrink-0"
                          style={{
                            display: "block",
                            filter: "brightness(0) saturate(100%) invert(21%) sepia(3%) saturate(137%) hue-rotate(201deg) opacity(0.85)"
                          }}
                        />
                      )}
                    </div>
                  </div>
                </td>

                <td style={{ ...tdPad, ...noBorder }} className={cellHover}>
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} hue={c.avatarHue} size="sm" />
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[15px] font-semibold text-[var(--text)] leading-tight truncate">
                          {c.name}
                        </span>
                      <span className="text-[13px] text-[var(--text-muted)] leading-tight truncate">
                          {c.currentTitle}
                        </span>
                      {workspaceLabel && (
                        <span className="text-[12px] text-[var(--text-muted)] opacity-60 leading-tight truncate">
                            {workspaceLabel}
                          </span>
                      )}
                    </div>
                  </div>
                </td>

                <td style={{ ...tdCenter, ...noBorder }} className={cellHover}>
                  <MatchCell score={c.backendMatchRate} />
                </td>

                <td style={{ ...tdCenter, ...noBorder }} className={cellHover}>
                    <span className="text-[14px] text-[var(--text-muted)] whitespace-nowrap">
                      {formatYearsExperience(c.yearsExperience)}
                    </span>
                </td>

                <td style={{ ...tdCenter, ...noBorder }} className={cellHover}>
                  <div className="flex justify-center">
                    <Tag>{capitalize(c.seniority)}</Tag>
                  </div>
                </td>

                <td style={{ ...tdCenter, ...noBorder }} className={cellHover}>
                    <span className="text-[14px] text-[var(--text-muted)] truncate inline-block max-w-[150px]">
                      {c.location}
                    </span>
                </td>

                <td style={{ ...tdCenter, ...noBorder }} className={cellHover}>
                  <div className="flex flex-wrap justify-center gap-1">
                    {c.topSkills.slice(0, 3).map((s) => (
                      <Tag key={s} tone="primary">{capitalize(s)}</Tag>
                    ))}
                  </div>
                </td>

                <td
                  style={{ ...tdCenter, ...noBorder }}
                  className={`${cellHover} rounded-r-xl`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <div
                      role="button"
                      tabIndex={0}
                      title="Quick overview"
                      onClick={() => onPreview(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPreview(c); }
                      }}
                      className={ICON_ACTION}
                    >
                      <Eye size={15} />
                    </div>

                    <div
                      role="button"
                      tabIndex={shortlistPending || !tenantId ? -1 : 0}
                      title={isShortlisted ? "Shortlisted" : "Shortlist"}
                      aria-pressed={isShortlisted}
                      onClick={() => { if (!shortlistPending && tenantId) onToggleShortlist(c); }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !shortlistPending && tenantId) {
                          e.preventDefault();
                          onToggleShortlist(c);
                        }
                      }}
                      className={
                        isShortlisted
                          ? "w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--primary)] text-[#39393a] transition-colors duration-150 outline-none focus:outline-none cursor-pointer"
                          : shortlistPending || !tenantId
                            ? "w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--border)] transition-colors duration-150 outline-none focus:outline-none opacity-50"
                            : ICON_ACTION
                      }
                    >
                      {isShortlisted ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
                    </div>

                    <Link
                      title="View Dossier"
                      to={`/dossier/${c.candidateId}`}
                      state={{
                        searchMatchScore: c.matchScore,
                        searchMatchSignals: c.matchSignals,
                        searchQuery,
                      }}
                      className="h-8 px-3 rounded-lg flex items-center text-[13px] font-normal bg-[var(--border)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150 outline-none focus:outline-none whitespace-nowrap"
                    >
                      Dossier
                    </Link>

                    <Link
                      title="Ask Agent"
                      to={buildChatHref([c.candidateId], "Why is this candidate a strong fit?")}
                      onMouseEnter={() => setHoveredAiId(c.candidateId)}
                      onMouseLeave={() => setHoveredAiId(null)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--border)] hover:bg-[var(--border-strong)] transition-colors duration-150 outline-none focus:outline-none"
                    >
                      <div className="relative w-4 h-4 shrink-0">
                        <img
                          src={aiOutlinedIcon}
                          alt="Ask Agent"
                          className="absolute inset-0 w-full h-full transition-all duration-300"
                          style={{
                            opacity: isAiHovered ? 0 : 0.7,
                            transform: isAiHovered ? "scale(1.15)" : "scale(1)",
                          }}
                        />
                        <img
                          src={aiFilledIcon}
                          alt=""
                          className="absolute inset-0 w-full h-full transition-all duration-300"
                          style={{
                            opacity: isAiHovered ? 1 : 0,
                            transform: isAiHovered ? "scale(1)" : "scale(0.85)",
                          }}
                        />
                      </div>
                    </Link>

                    {partnerId && (
                      <Link
                        title="Compare"
                        to={`/compare?ids=${c.candidateId},${partnerId}`}
                        className="h-8 px-3 rounded-lg flex items-center text-[13px] font-normal bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] transition-colors duration-150 outline-none focus:outline-none whitespace-nowrap"
                      >
                        Compare
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
