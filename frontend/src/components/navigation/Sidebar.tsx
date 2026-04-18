import {
  Bot,
  X,
  FlaskConical,
  FileText,
  GitCompareArrows,
  Home,
  Search,
  Workflow,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const productRoutes = [
  { to: "/search", label: "Search & Discovery", icon: Search },
  { to: "/chat", label: "General Agent", icon: Bot },
  { to: "/compare", label: "Intelligent Comparison", icon: GitCompareArrows },
];

const operationsRoutes = [
  { to: "/admin/parsing", label: "Parsing Quality", icon: FileText },
  { to: "/admin/parsing/lab", label: "Parsing Lab", icon: FlaskConical },
];

type SidebarProps = {
  mobileOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
};

export function Sidebar({ mobileOpen, isMobile, onClose }: SidebarProps) {
  const location = useLocation();
  const { currentTenant, userEmail, isAdmin } = useAuth();

  return (
    <aside className={cn("sidebar", mobileOpen && "sidebar--open")}>
      <div className="sidebar__header">
        <div className="brand-mark">
          <div className="brand-mark__icon">
            <Workflow size={20} strokeWidth={2.4} />
          </div>
          <div>
            <strong>CV Intelligence</strong>
            <span>Talent Intelligence Platform</span>
          </div>
        </div>
        {isMobile ? (
          <button className="icon-button sidebar__close" onClick={onClose} aria-label="Close navigation" type="button">
            <X size={18} />
          </button>
        ) : null}
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
          <span className="sidebar__heading">Admin</span>
          {operationsRoutes.map((route) => {
            const Icon = route.icon;
            const active =
              route.to === "/admin/parsing/lab"
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

      <div className="sidebar__footer">
        <div className="session-chip">
          <div className="session-chip__dot" />
          <div>
            <strong>{currentTenant?.name ?? "AI Recruiter Bot"}</strong>
            <span>{currentTenant ? `${currentTenant.role} · ${userEmail ?? "active session"}` : "Active orchestration session"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
