// frontend/src/screens/ShortlistPage.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Trash2,
  FileSpreadsheet,
  Bot,
  GitCompareArrows,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { platformApi } from "@/lib/platformApi";
import type { CandidateDetail } from "@/lib/contracts";
import { Avatar, Panel, Tag } from "@/components/ui";

const SHORTLIST_STORAGE_KEY = "sync-shortlist-ids";

export function getShortlistIds(): string[] {
  try {
    const stored = localStorage.getItem(SHORTLIST_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveShortlistIds(ids: string[]) {
  localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("shortlist-updated"));
}

export function ShortlistPage() {
  const navigate = useNavigate();
  const [shortlistIds, setShortlistIds] = useState<string[]>(() => getShortlistIds());
  const [candidates, setCandidates] = useState<CandidateDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setShortlistIds(getShortlistIds());
    };
    window.addEventListener("shortlist-updated", handleUpdate);
    return () => window.removeEventListener("shortlist-updated", handleUpdate);
  }, []);

  // Fetch full profile details of shortlisted candidates
  useEffect(() => {
    if (!shortlistIds.length) {
      setCandidates([]);
      return;
    }

    let active = true;
    setLoading(true);

    Promise.all(shortlistIds.map(id => platformApi.getCandidate(id)))
      .then((data) => {
        if (active) {
          // Filter out failed loads or null profiles
          setCandidates(data.filter(Boolean));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load shortlisted profiles:", err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shortlistIds]);

  const handleRemove = (candidateId: string) => {
    const nextIds = shortlistIds.filter(id => id !== candidateId);
    saveShortlistIds(nextIds);
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear your shortlist?")) {
      saveShortlistIds([]);
    }
  };

  // Quick export tool to generate spreadsheets directly
  const handleExportCSV = () => {
    if (!candidates.length) return;

    const headers = ["Candidate ID", "Name", "Current Title", "Primary Role", "Seniority", "Tenant ID"];
    const rows = candidates.map(c => [
      c.candidateId,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.currentTitle || "").replace(/"/g, '""')}"`,
      `"${c.primaryRole || ""}"`,
      `"${c.seniority || ""}"`,
      c.tenantId
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `shortlist_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCompare = () => {
    if (!shortlistIds.length) return;
    // Redirects to comparison interface loaded with selected ids
    navigate(`/compare?ids=${shortlistIds.join(",")}`);
  };

  const handleChatWithAI = () => {
    if (!shortlistIds.length) return;
    // Redirects to Intelligence Chat scoped specifically to these candidates
    navigate(`/chat?ids=${shortlistIds.join(",")}`);
  };

  return (
    <div className="page-stack shortlist-page">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">

        {candidates.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="button button--secondary flex items-center gap-2"
              title="Download structured spreadsheet report"
            >
              <FileSpreadsheet size={16} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleClearAll}
              className="button button--secondary text-red-400 hover:text-red-300 hover:border-red-500/30"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#50c1b8]" />
          <p className="mt-4 text-[#b9d3d1] text-sm">Loading profiles...</p>
        </div>
      ) : candidates.length === 0 ? (
        <Panel className="flex flex-col items-center justify-center text-center p-16 border border-dashed border-[#50c1b8]/10 bg-[#323233]/40">
          <div className="w-16 h-16 rounded-full bg-[#50c1b8]/10 flex items-center justify-center text-[#50c1b8] mb-4">
            <Users size={32} />
          </div>
          <h3 className="text-lg font-bold text-[#f6fbfa] mb-2">Your shortlist is empty</h3>
          <p className="text-[#b9d3d1] max-w-md mb-6 text-sm">
            Discover outstanding candidates in the Talent Pool and click "Add to Shortlist" to save them here for comparative review.
          </p>
          <Link to="/search" className="button button--primary flex items-center gap-2">
            <span>Explore Talent Pool</span>
            <ArrowRight size={16} />
          </Link>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Candidate Card Grid */}
          <div className="lg:col-span-2 space-y-4">
            {candidates.map((candidate) => (
              <Panel
                key={candidate.candidateId}
                className="flex items-start justify-between gap-4 p-5 hover:border-[#50c1b8]/30 transition-colors duration-200"
              >
                <div className="flex gap-4">
                  <Avatar name={candidate.name} hue={candidate.avatarHue} size="md" />
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-base font-bold text-[#f6fbfa]">{candidate.name}</h3>
                      <p className="text-sm text-gray-400">{candidate.currentTitle || "No Current Title specified"}</p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Tag>{candidate.seniority}</Tag>
                      <Tag tone="primary">{candidate.primaryRole}</Tag>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/dossier/${candidate.candidateId}`}
                    className="button button--secondary text-xs py-1.5 px-3 h-auto"
                  >
                    View Dossier
                  </Link>

                  <button
                    onClick={() => handleRemove(candidate.candidateId)}
                    className="icon-button text-gray-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20"
                    title="Remove candidate"
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Panel>
            ))}
          </div>

          {/* Quick Actions Panel */}
          <div className="space-y-4">
            <Panel className="bg-[#50c1b8]/5 border border-[#50c1b8]/20 p-6 space-y-6">
              <div className="flex items-center gap-2 text-[#50c1b8]">
                <Sparkles size={20} />
                <h3 className="font-bold text-[#f6fbfa]">Shortlist Insights</h3>
              </div>

              <div className="text-sm text-[#b9d3d1] space-y-2 leading-relaxed">
                <p>You have selected <strong>{candidates.length}</strong> core candidate profiles.</p>
                <p>Use these customized automations to expedite your recruitment qualification process:</p>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  onClick={handleChatWithAI}
                  className="w-full button button--primary flex items-center justify-center gap-2 py-3"
                >
                  <Bot size={18} />
                  <span>Ask SYNC AI about them</span>
                </button>

                <button
                  onClick={handleCompare}
                  className="w-full button button--secondary flex items-center justify-center gap-2 py-3 text-[#50c1b8] border-[#50c1b8]/30 hover:border-[#50c1b8]/60"
                >
                  <GitCompareArrows size={18} />
                  <span>Compare Candidate Gaps</span>
                </button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
