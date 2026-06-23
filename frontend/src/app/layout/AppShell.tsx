import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { cn } from "@/lib/cn";

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLElement | null>(null);
  const location = useLocation();

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
        <Topbar navigationOpen={navigationOpen} onOpenNavigation={openNavigation} />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
