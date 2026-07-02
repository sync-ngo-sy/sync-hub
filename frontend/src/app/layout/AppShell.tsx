// frontend/src/app/layout/AppShell.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";

// const DEV_JOB_PAGES = [
//   { label: "Job List", path: "/jobs" },
//   { label: "Job Create", path: "/jobs/new" },
//   { label: "Job Detail", path: "/jobs/dummy-job-id" },
//   { label: "Job Edit", path: "/jobs/dummy-job-id/edit" },
//   { label: "Matching Run", path: "/jobs/dummy-job-id/runs/dummy-run-id" },
// ];

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    return stored === "true";
  });

  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  };

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    window.setTimeout(() => navigationTriggerRef.current?.focus(), 0);
  }, []);

  const openNavigation = useCallback(() => {
    navigationTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNavigationOpen(true);
  }, []);

  useEffect(() => {
    closeNavigation();
  }, [closeNavigation, location.pathname]);

  const sidebarWidthExpanded = 256;
  const sidebarWidthCollapsed = 80;

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      <Sidebar
        open={navigationOpen}
        onClose={closeNavigation}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      {navigationOpen ? (
        <button
          className="sidebar-scrim"
          onClick={closeNavigation}
          aria-label="Close navigation"
          type="button"
        />
      ) : null}

      <div
        className="app-shell__main"
        style={{
          marginLeft: collapsed ? sidebarWidthCollapsed : sidebarWidthExpanded,
          transition: "margin-left 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Topbar />

        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>

      {/*{import.meta.env.DEV ? (*/}
      {/*  <div*/}
      {/*    style={{*/}
      {/*      position: "fixed",*/}
      {/*      right: 16,*/}
      {/*      bottom: 16,*/}
      {/*      zIndex: 99999,*/}
      {/*      display: "flex",*/}
      {/*      gap: 8,*/}
      {/*      flexWrap: "wrap",*/}
      {/*      justifyContent: "flex-end",*/}
      {/*      maxWidth: 520,*/}
      {/*      padding: 10,*/}
      {/*      borderRadius: 12,*/}
      {/*      background: "rgba(30, 30, 31, 0.92)",*/}
      {/*      border: "1px solid rgba(80, 193, 184, 0.45)",*/}
      {/*      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.35)",*/}
      {/*      backdropFilter: "blur(10px)",*/}
      {/*    }}*/}
      {/*  >*/}
      {/*    {DEV_JOB_PAGES.map((page) => {*/}
      {/*      const active = location.pathname === page.path;*/}

      {/*      return (*/}
      {/*        <button*/}
      {/*          key={page.path}*/}
      {/*          type="button"*/}
      {/*          onClick={() => navigate(page.path)}*/}
      {/*          style={{*/}
      {/*            background: active ? "#50c1b8" : "#1e1e1f",*/}
      {/*            color: active ? "#ffffff" : "#50c1b8",*/}
      {/*            border: "1px solid #50c1b8",*/}
      {/*            borderRadius: 8,*/}
      {/*            padding: "8px 12px",*/}
      {/*            fontWeight: 700,*/}
      {/*            fontSize: 12,*/}
      {/*            cursor: "pointer",*/}
      {/*            whiteSpace: "nowrap",*/}
      {/*          }}*/}
      {/*        >*/}
      {/*          {page.label}*/}
      {/*        </button>*/}
      {/*      );*/}
      {/*    })}*/}
      {/*  </div>*/}
      {/*) : null}*/}
    </div>
  );
}
