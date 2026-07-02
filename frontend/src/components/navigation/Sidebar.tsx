// frontend/src/components/navigation/Sidebar.tsx

import React, {useEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";
import {ChevronDown, PanelLeftClose, PanelLeftOpen, X} from "lucide-react";
import {adminNavigation, workspaceNavigation} from "@/app/routeRegistry";
import {Link, useLocation} from "react-router-dom";
import {useAuth} from "@/lib/auth";
import {cn} from "@/lib/cn";
import {SyncBrand} from "@/components/ui";
import {chatStore} from "@/screens/sync-ai";

import insightsIcon from "@/assets/insights.svg";
import groupFilled from "@/assets/group_filled.svg";
import groupOutlined from "@/assets/group_outlined.svg";
import jobPostingFilled from "@/assets/job-posting-filled.svg";
import jobPostingOutlined from "@/assets/job-posting-outlined.svg";
import aiFilled from "@/assets/ai_filled.svg";
import aiOutlined from "@/assets/ai_outlined.svg";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

type SidebarNavItemProps = {
  to: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  customIconActive?: string;
  customIconInactive?: string;
  icon?: React.ComponentType<any>;
  hasUnread?: boolean;
  onClose: () => void;
};

function SidebarNavItem({
                          to,
                          label,
                          active,
                          collapsed,
                          customIconActive,
                          customIconInactive,
                          icon: Icon,
                          hasUnread,
                          onClose,
                        }: SidebarNavItemProps) {
  const showActiveIcon = active || hasUnread;

  return (
    <Link
      to={to}
      className={cn(
        "group relative flex items-center justify-start px-[17px] py-2.5 rounded-xl transition-all duration-300 active:scale-95",
        "hover:bg-[#444446]/60",
        active
          ? "bg-[#50c1b8]/20 text-[#50c1b8]"
          : "text-[#b9d3d1] hover:text-[#f6fbfa]"
      )}
      onClick={onClose}
    >
      <div className="relative shrink-0 w-[22px] h-[22px] flex items-center justify-center">
        {customIconActive && customIconInactive ? (
          <div className="relative w-[22px] h-[22px]">
            <img
              src={customIconInactive}
              alt=""
              className={cn(
                "absolute inset-0 w-full h-full select-none pointer-events-none object-contain transition-all duration-300 ease-in-out",
                showActiveIcon ? "opacity-0 scale-95" : "opacity-100 scale-100"
              )}
            />
            <img
              src={customIconActive}
              alt=""
              className={cn(
                "absolute inset-0 w-full h-full select-none pointer-events-none object-contain transition-all duration-300 ease-in-out",
                showActiveIcon ? "opacity-100 scale-100" : "opacity-0 scale-95"
              )}
            />
          </div>
        ) : (
          Icon && (
            <Icon
              size={22}
              className={cn(
                "transition-colors duration-300 ease-in-out",
                active ? "text-[#50c1b8]" : "text-[#b9d3d1]"
              )}
            />
          )
        )}

        {hasUnread && (
          <span
            className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#50c1b8] animate-pulse ring-2 ring-[#323233]"/>
        )}
      </div>

      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-300 relative",
          collapsed ? "w-0 opacity-0 ml-0" : "w-auto opacity-100 ml-4"
        )}
      >
        {label}
      </span>

      {collapsed && (
        <div
          className="absolute left-full ml-4 px-3 py-2 bg-[#444446]/95 backdrop-blur-md text-[#f6fbfa] text-xs font-medium rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-x-2 group-hover:translate-x-0 z-50 whitespace-nowrap shadow-xl">
          {label}
          {hasUnread && " (New message)"}
        </div>
      )}
    </Link>
  );
}

const excludedPaths = ["/insights", "/search", "/jobs", "/chat"];

const baseFilteredNavigation = workspaceNavigation.filter(
  (item) => !excludedPaths.some((path) => item.to === path || item.to.startsWith(path))
);

const staticNavItems = [
  {
    to: "/insights",
    label: "Insights",
    match: (path: string) => path === "/insights" || path.startsWith("/insights/"),
    customIconActive: insightsIcon,
    customIconInactive: insightsIcon,
  },
  {
    to: "/search",
    label: "Talent Pool",
    match: (path: string) => path === "/search" || path.startsWith("/search/"),
    customIconActive: groupFilled,
    customIconInactive: groupOutlined,
  },
  {
    to: "/jobs",
    label: "Job Postings",
    match: (path: string) => path.startsWith("/jobs"),
    customIconActive: jobPostingFilled,
    customIconInactive: jobPostingOutlined,
  },
  ...baseFilteredNavigation,
];

export function Sidebar({open, onClose, collapsed, onToggleCollapsed}: SidebarProps) {
  const location = useLocation();
  const {currentTenant, isAdmin} = useAuth();
  const isAdminRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const [adminOpen, setAdminOpen] = useState(isAdminRoute);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const chatState = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot) as typeof chatStore.state;

  useEffect(() => {
    if (location.pathname === "/compare" && location.search) {
      sessionStorage.setItem("sync-last-compare-url", location.pathname + location.search);
    }
  }, [location]);

  useEffect(() => {
    if (isAdminRoute) setAdminOpen(true);
  }, [isAdminRoute]);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  const orderedWorkspaceNavigation = useMemo(() => [
    ...staticNavItems.slice(0, 3),
    {
      to: "/chat",
      label: "SYNC AI",
      match: (path: string) => path === "/chat" || path.startsWith("/chat/"),
      customIconActive: aiFilled,
      customIconInactive: aiOutlined,
      hasUnread: chatState.hasUnreadResponse,
    },
    ...staticNavItems.slice(3),
  ], [chatState.hasUnreadResponse]);

  // Matched exactly to Topbar.tsx
  const displayName = currentTenant?.name ?? "Active Workspace";
  const displayRole = currentTenant?.role ?? "Session Member";
  const displayAvatar =
    currentTenant?.iconUrl ||
    "https://images.pexels.com/photos/37884668/pexels-photo-37884668.jpeg?_gl=1*8iun97*_ga*MTMwOTg5MjM4Mi4xNzgyNjY0ODk5*_ga_8JE65Q40S6*czE3ODI2NjQ4OTkkbzEkZzEkdDE3ODI2NjQ5MTUkajQ0JGwwJGgw";

  return (
    <>
      <style>{`
        .admin-sidebar-nav::-webkit-scrollbar { display: none; }
        .admin-sidebar-nav { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <aside
        className={cn(
          "fixed top-0 left-0 h-screen z-40 flex flex-col",
          "bg-[#323233]/90 backdrop-blur-2xl border-r border-[#50c1b8]/20",
          "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          collapsed ? "w-20" : "w-64",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
        aria-hidden={!open}
      >
        <div
          className={cn("h-24 px-6 shrink-0 flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 scale-85 origin-left shrink-0 mt-8",
              collapsed ? "w-0 opacity-0" : "max-w-[130px] opacity-100"
            )}
          >
            <SyncBrand subtitle="Talent Intelligence Platform"/>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              className="icon-button transition-all mb-4 duration-300 ease-out hover:bg-[#50c1b8]/20 hover:border-[#50c1b8]/40 hover:text-[#50c1b8] active:scale-95"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              {collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}
            </button>
            <button
              ref={closeButtonRef}
              className="icon-button transition-all duration-300 ease-out hover:bg-[#50c1b8]/20 hover:border-[#50c1b8]/40 hover:text-[#50c1b8] active:scale-95 lg:hidden"
              onClick={onClose}
              aria-label="Close navigation"
              type="button"
            >
              <X size={18}/>
            </button>
          </div>
        </div>

        <nav className="admin-sidebar-nav flex-1 overflow-y-auto px-3 flex flex-col justify-center space-y-6">
          {orderedWorkspaceNavigation.map((route: any) => {
            const isRootPath = location.pathname === "/" || location.pathname === "";
            const isInsights = route.label.toLowerCase() === "insights";
            const active = route.match(location.pathname) || (isInsights && isRootPath);

            const targetTo = route.to === "/compare"
              ? (sessionStorage.getItem("sync-last-compare-url") || route.to)
              : route.to;

            return (
              <SidebarNavItem
                key={route.to}
                to={targetTo}
                label={route.label}
                active={active}
                collapsed={collapsed}
                customIconActive={route.customIconActive}
                customIconInactive={route.customIconInactive}
                icon={route.icon}
                hasUnread={route.hasUnread}
                onClose={onClose}
              />
            );
          })}

          {isAdmin && (
            <div className="pt-6 mt-6 border-t border-[#50c1b8]/10">
              <button
                className={cn(
                  "flex items-center w-full px-[17px] py-2 rounded-xl transition-all",
                  "hover:bg-[#444446]/60 text-[#b9d3d1]",
                  collapsed ? "justify-center" : "justify-between"
                )}
                type="button"
                aria-expanded={adminOpen}
                onClick={() => setAdminOpen((v) => !v)}
              >
                <span
                  className={cn(
                    "text-xs font-medium text-[#88aaa7] tracking-wider uppercase overflow-hidden whitespace-nowrap transition-all duration-300",
                    collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                  )}
                >
                  Admin
                </span>
                <ChevronDown
                  size={14}
                  className={cn("transition-transform duration-200", adminOpen && "rotate-180", collapsed && "ml-0")}
                />
              </button>
              {adminOpen && (
                <div className="mt-2 space-y-2">
                  {adminNavigation.map((route) => {
                    const active = route.match(location.pathname);
                    return (
                      <SidebarNavItem
                        key={route.to}
                        to={route.to}
                        label={route.label}
                        active={active}
                        collapsed={collapsed}
                        icon={route.icon}
                        onClose={onClose}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Profile Footer */}
        <Link
          to="/settings"
          onClick={onClose}
          className={cn("shrink-0 border-t border-[#50c1b8]/10 transition-all duration-300 group no-underline", collapsed ? "p-3" : "p-5")}
        >
          <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3.5 text-left")}>
            <div
              className="w-11 h-11 rounded-full overflow-hidden shrink-0 transition-all duration-300"
              style={{
                border: '1px solid var(--primary)'
              }}
            >
              <img
                src={displayAvatar}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            </div>

            {!collapsed && (
              <div className="flex flex-col overflow-hidden whitespace-nowrap">
                <span
                  className="font-semibold text-[15px] text-[var(--text)] group-hover:text-[var(--primary)] leading-tight tracking-tight transition-colors duration-250">
                  {displayName}
                </span>

                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs font-medium text-[var(--text-muted)] opacity-85 leading-none">
                    {displayRole}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Link>
      </aside>
    </>
  );
}
