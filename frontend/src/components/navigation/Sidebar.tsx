import { useEffect, useState } from "react";
import {
  Bot,
  Bell,
  ChevronDown,
  X,
  FlaskConical,
  FileText,
  GitCompareArrows,
  Home,
  LayoutDashboard,
  Search,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { SyncBrand, TenantBadge } from "@/components/ui";

const productRoutes = [
  { to: "/search", label: "Search & Discovery", icon: Search },
  { to: "/chat", label: "General Agent", icon: Bot },
  { to: "/compare", label: "Intelligent Comparison", icon: GitCompareArrows },
];

const operationsRoutes = [
  { to: "/admin", label: "Platform Dashboard", icon: LayoutDashboard },
  { to: "/admin/alerts", label: "Alerts", icon: Bell },
  { to: "/admin/manatal-sync", label: "Manatal Sync", icon: RefreshCw },
  { to: "/admin/search-simulator", label: "Search Simulator", icon: SlidersHorizontal },
  { to: "/admin/parsing", label: "Parsing Quality", icon: FileText },
  { to: "/admin/parsing/lab", label: "Parsing Lab", icon: FlaskConical },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const { currentTenant, userEmail, isAdmin } = useAuth();
  const isAdminRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const [adminOpen, setAdminOpen] = useState(isAdminRoute);

  useEffect(() => {
    if (isAdminRoute) {
      setAdminOpen(true);
    }
  }, [isAdminRoute]);

  return (
    <aside className={cn("sidebar", open && "sidebar--open")}>
      <div className="sidebar__header">
        <SyncBrand />
        <button className="icon-button sidebar__close" onClick={onClose} aria-label="Close navigation" type="button">
          <X size={18} />
        </button>
      </div>

      <Link to="/search" className="button button--primary button--full" onClick={onClose}>
        <Home size={16} />
        New Search
      </Link>

      <div className="sidebar__group">
        <span className="sidebar__heading">Workspace</span>
        {productRoutes.map((route) => {
          const Icon = route.icon;
          const active =
            location.pathname === route.to ||
            (route.to.startsWith("/dossier") && location.pathname.startsWith("/dossier"));

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
              {operationsRoutes.map((route) => {
                const Icon = route.icon;
                const active =
                  route.to === "/admin"
                    ? location.pathname === route.to || location.pathname === "/admin/dashboard"
                    : route.to === "/admin/alerts"
                    ? location.pathname === route.to
                    : route.to === "/admin/manatal-sync"
                    ? location.pathname === route.to
                    : route.to === "/admin/search-simulator"
                    ? location.pathname === route.to
                    : route.to === "/admin/parsing/lab"
                    ? location.pathname === route.to
                    : location.pathname === route.to ||
                      (location.pathname.startsWith("/admin/parsing/") && !location.pathname.startsWith("/admin/parsing/lab"));

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
