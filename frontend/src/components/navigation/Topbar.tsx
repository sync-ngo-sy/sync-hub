import { LogOut, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { routeChromeForPath } from "@/app/routeRegistry";
import { useAuth } from "@/lib/auth";

type TopbarProps = {
  navigationOpen: boolean;
  onOpenNavigation: () => void;
};

export function Topbar({ navigationOpen, onOpenNavigation }: TopbarProps) {
  const location = useLocation();
  const active = routeChromeForPath(location.pathname);
  const { enabled, signOut } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__title">
        <button
          className="icon-button topbar__menu"
          onClick={onOpenNavigation}
          aria-controls="app-sidebar"
          aria-expanded={navigationOpen}
          aria-label="Open navigation"
          type="button"
        >
          <Menu size={18} />
        </button>
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
