import { useEffect, useRef, useState } from "react";
import { ChevronDown, Home, X } from "lucide-react";
import { adminNavigation, workspaceNavigation } from "@/app/routeRegistry";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { SyncBrand, TenantBadge } from "@/components/ui";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const { currentTenant, userEmail, isAdmin } = useAuth();
  const isAdminRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const [adminOpen, setAdminOpen] = useState(isAdminRoute);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isAdminRoute) {
      setAdminOpen(true);
    }
  }, [isAdminRoute]);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeButtonRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  const inertProps = open ? {} : ({ inert: "" } as Record<string, string>);

  return (
    <aside id="app-sidebar" className={cn("sidebar", open && "sidebar--open")} aria-hidden={!open} {...inertProps}>
      <div className="sidebar__header">
        <SyncBrand />
        <button ref={closeButtonRef} className="icon-button sidebar__close" onClick={onClose} aria-label="Close navigation" type="button">
          <X size={18} />
        </button>
      </div>

      <Link to="/search" className="button button--primary button--full" onClick={onClose}>
        <Home size={16} />
        New Search
      </Link>

      <div className="sidebar__group">
        <span className="sidebar__heading">Workspace</span>
        {workspaceNavigation.map((route) => {
          const Icon = route.icon;
          const active = route.match(location.pathname);

          return (
            <Link key={route.to} to={route.to} className={cn("sidebar__link", active && "sidebar__link--active")} onClick={onClose}>
              <Icon size={16} />
              <span>{route.label}</span>
            </Link>
          );
        })}
      </div>

      {isAdmin ? (
        <div className="sidebar__group">
          <button
            className="sidebar__section-toggle"
            type="button"
            aria-expanded={adminOpen}
            onClick={() => setAdminOpen((value) => !value)}
          >
            <span className="sidebar__heading">Admin</span>
            <ChevronDown size={14} className={cn("sidebar__section-chevron", adminOpen && "sidebar__section-chevron--open")} />
          </button>
          {adminOpen ? (
            <div className="sidebar__section-content">
              {adminNavigation.map((route) => {
                const Icon = route.icon;
                const active = route.match(location.pathname);

                return (
                  <Link key={route.to} to={route.to} className={cn("sidebar__link", active && "sidebar__link--active")} onClick={onClose}>
                    <Icon size={16} />
                    <span>{route.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sidebar__footer">
        <div className="session-chip">
          <TenantBadge
            name={currentTenant?.name ?? "AI Recruiter Bot"}
            iconUrl={currentTenant?.iconUrl}
            size="md"
          />
          <div className="session-chip__copy">
            <strong>{currentTenant?.name ?? "AI Recruiter Bot"}</strong>
            <span>{currentTenant ? `${currentTenant.role} · ${userEmail ?? "active session"}` : "Active orchestration session"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
