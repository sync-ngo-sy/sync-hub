import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 960 : false));
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function syncViewport() {
      const nextIsMobile = window.innerWidth <= 960;
      setIsMobile(nextIsMobile);
      if (!nextIsMobile) {
        setMobileOpen(false);
      }
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <Sidebar mobileOpen={mobileOpen} isMobile={isMobile} onClose={() => setMobileOpen(false)} />
      {isMobile && mobileOpen ? <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" type="button" /> : null}
      <div className="app-shell__main">
        <Topbar showNavigationToggle={isMobile} onOpenNavigation={() => setMobileOpen(true)} />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
