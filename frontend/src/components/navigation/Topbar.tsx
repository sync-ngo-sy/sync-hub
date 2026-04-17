import { Bell, LogOut, Menu, Search, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const routeMeta: Array<{ test: (path: string) => boolean; title: string; subtitle: string }> = [
  {
    test: (path) => path === "/search",
    title: "Search & Discovery",
    subtitle: "Hybrid retrieval over structured profiles and chunk-level evidence",
  },
  {
    test: (path) => path === "/search-config",
    title: "Search Configuration",
    subtitle: "Tune intent parsing, filters, and ranking posture",
  },
  {
    test: (path) => path.startsWith("/dossier"),
    title: "Candidate Dossier",
    subtitle: "Grounded profile view with timeline, skills, and supporting evidence",
  },
  {
    test: (path) => path === "/compare",
    title: "Intelligent Comparison",
    subtitle: "Side-by-side recommendation with grounded overlap and gaps",
  },
  {
    test: (path) => path === "/intelligence",
    title: "Intelligence Hub",
    subtitle: "Bounded reasoning over selected candidates and retrieved evidence",
  },
  {
    test: (path) => path === "/analytics",
    title: "Analytics & Insights",
    subtitle: "Recruiter telemetry, search adoption, and pipeline trends",
  },
  {
    test: (path) => path === "/admin/health",
    title: "System Health & Monitoring",
    subtitle: "Operational status across workers, connectors, and search runtime",
  },
  {
    test: (path) => path === "/admin/data",
    title: "Data Management & Indexing",
    subtitle: "Source freshness, ingestion throughput, and active synchronization jobs",
  },
  {
    test: (path) => path === "/admin/indexing",
    title: "Search Configuration",
    subtitle: "Ranking weights, index quality, and corpus behavior",
  },
  {
    test: (path) => path === "/admin/access",
    title: "Access Management",
    subtitle: "Tenant roles, audit trail, and permissions posture",
  },
];

type TopbarProps = {
  onOpenNavigation: () => void;
};

export function Topbar({ onOpenNavigation }: TopbarProps) {
  const location = useLocation();
  const active = routeMeta.find((item) => item.test(location.pathname)) ?? routeMeta[0];
  const { currentTenant, enabled, signOut, userEmail } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__title">
        <button className="icon-button topbar__menu" onClick={onOpenNavigation} aria-label="Open navigation" type="button">
          <Menu size={18} />
        </button>
        <div>
          <strong>{active.title}</strong>
          <span>{active.subtitle}</span>
        </div>
      </div>

      <div className="topbar__actions">
        <div className="topbar__command">
          <Search size={15} />
          <span>Command Bar</span>
          <kbd>⌘K</kbd>
        </div>
        {enabled && currentTenant ? (
          <div className="topbar__workspace">
            <strong>{currentTenant.name}</strong>
            <span>
              {currentTenant.role} · {userEmail ?? "signed in"}
            </span>
          </div>
        ) : null}
        <button className="icon-button" aria-label="Notifications" type="button">
          <Bell size={18} />
        </button>
        <button className="icon-button" aria-label="Settings" type="button">
          <Settings size={18} />
        </button>
        {enabled ? (
          <button className="button button--secondary topbar__signout" onClick={() => void signOut()} type="button">
            <LogOut size={14} />
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
