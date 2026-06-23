import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLElement | null>(null);
  const location = useLocation();

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    window.setTimeout(() => navigationTriggerRef.current?.focus(), 0);
  }, []);

  const openNavigation = useCallback(() => {
    navigationTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNavigationOpen(true);
  }, []);

  useEffect(() => {
    closeNavigation();
  }, [closeNavigation, location.pathname]);

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <Sidebar open={navigationOpen} onClose={closeNavigation} />
      {navigationOpen ? <button className="sidebar-scrim" onClick={closeNavigation} aria-label="Close navigation" type="button" /> : null}
      <div className="app-shell__main">
        <Topbar navigationOpen={navigationOpen} onOpenNavigation={openNavigation} />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
