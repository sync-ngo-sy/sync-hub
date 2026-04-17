import { LogOut, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const routeMeta: Array<{ test: (path: string) => boolean; title: string; subtitle: string }> = [
  {
    test: (path) => path === "/search",
    title: "Search & Discovery",
    subtitle: "Hybrid retrieval over structured profiles and chunk-level evidence",
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
    test: (path) => path === "/admin/parsing",
    title: "Parsing Quality",
    subtitle: "Operational view of CV field coverage, confidence, and parser diagnostics",
  },
  {
    test: (path) => path === "/admin/parsing/lab",
    title: "Parsing Lab",
    subtitle: "Versioned parser profiles, prompts, and publish controls for the offline worker",
  },
  {
    test: (path) => path.startsWith("/admin/parsing/"),
    title: "Parsing Detail",
    subtitle: "Per-document extraction diagnostics with field-level coverage and optimization hints",
  },
];

type TopbarProps = {
  showNavigationToggle: boolean;
  onOpenNavigation: () => void;
};

export function Topbar({ showNavigationToggle, onOpenNavigation }: TopbarProps) {
  const location = useLocation();
  const active = routeMeta.find((item) => item.test(location.pathname)) ?? routeMeta[0];
  const { enabled, signOut } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__title">
        {showNavigationToggle ? (
          <button className="icon-button topbar__menu" onClick={onOpenNavigation} aria-label="Open navigation" type="button">
            <Menu size={18} />
          </button>
        ) : null}
        <div>
          <strong>{active.title}</strong>
          <span>{active.subtitle}</span>
        </div>
      </div>

      <div className="topbar__actions">
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
