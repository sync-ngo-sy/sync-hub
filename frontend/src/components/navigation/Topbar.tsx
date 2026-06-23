import { LogOut } from "lucide-react";
import { useLocation } from "react-router-dom";
import { routeChromeForPath } from "@/app/routeRegistry";
import { useAuth } from "@/lib/auth";

export function Topbar() {
  const location = useLocation();
  const active = routeChromeForPath(location.pathname);
  const { enabled, signOut } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__title">
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
