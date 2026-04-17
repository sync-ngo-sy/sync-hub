import {
  Activity,
  BarChart3,
  BrainCircuit,
  Database,
  GitCompareArrows,
  Home,
  Search,
  Settings2,
  Shield,
  UserSquare2,
  Workflow,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const productRoutes = [
  { to: "/search", label: "Search & Discovery", icon: Search },
  { to: "/intelligence", label: "Intelligence Hub", icon: BrainCircuit },
  { to: "/compare", label: "Intelligent Comparison", icon: GitCompareArrows },
  { to: "/dossier/elena-rostova", label: "Candidate Dossier", icon: UserSquare2 },
  { to: "/analytics", label: "Analytics & Insights", icon: BarChart3 },
];

const adminRoutes = [
  { to: "/admin/health", label: "System Health", icon: Activity },
  { to: "/admin/data", label: "Data Management", icon: Database },
  { to: "/admin/indexing", label: "Search Configuration", icon: Settings2 },
  { to: "/admin/access", label: "Access Management", icon: Shield },
];

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { currentTenant, userEmail } = useAuth();

  return (
    <aside className={cn("sidebar", mobileOpen && "sidebar--open")}>
      <div className="brand-mark">
        <div className="brand-mark__icon">
          <Workflow size={20} strokeWidth={2.4} />
        </div>
        <div>
          <strong>CV Intelligence</strong>
          <span>Talent Intelligence Platform</span>
        </div>
      </div>

      <Link to="/search-config" className="button button--primary button--full" onClick={onClose}>
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

      <div className="sidebar__group">
        <span className="sidebar__heading">Administration</span>
        {adminRoutes.map((route) => {
          const Icon = route.icon;
          const active = location.pathname === route.to;

          return (
            <Link key={route.to} to={route.to} className={cn("sidebar__link", active && "sidebar__link--active")} onClick={onClose}>
              <Icon size={16} />
              <span>{route.label}</span>
            </Link>
          );
        })}
      </div>

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
