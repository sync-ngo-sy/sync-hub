import { useLocation, Link } from "react-router-dom";
import { routeChromeForPath } from "@/app/routeRegistry";
import { useAuth } from "@/lib/auth";

export function Topbar() {
  const location = useLocation();
  const active = routeChromeForPath(location.pathname);
  const { currentTenant } = useAuth();

  const displayName = currentTenant?.name ?? "Active Workspace";
  const displayRole = currentTenant?.role ?? "Session Member";
  const displayAvatar =
    currentTenant?.iconUrl ||
    "https://images.pexels.com/photos/37884668/pexels-photo-37884668.jpeg?_gl=1*8iun97*_ga*MTMwOTg5MjM4Mi4xNzgyNjY0ODk5*_ga_8JE65Q40S6*czE3ODI2NjQ4OTkkbzEkZzEkdDE3ODI2NjQ5MTUkajQ0JGwwJGgw";

  return (
    <header className="topbar flex items-center justify-between px-6 h-16 shrink-0 z-10">
      <div className="topbar__title">
        <div>
          <strong>{active.title}</strong>
          <span>{active.subtitle}</span>
        </div>
      </div>

      <div className="topbar__actions flex items-center gap-4">
        {/* Replaced generic div wrapper with direct Router Link to Settings */}
        <Link
          to="/settings"
          className="flex items-center gap-3.5 hover:opacity-95 active:scale-98 transition-all duration-200 cursor-pointer group text-left no-underline"
        >
          <div
            className="w-11 h-11 rounded-full overflow-hidden shrink-0 transition-all duration-300"
            style={{
              border: "1px solid var(--primary)"
            }}
          >
            <img
              src={displayAvatar}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex flex-col">
            <span className="font-semibold text-[15px] text-[var(--text)] leading-tight tracking-tight group-hover:text-[var(--primary)] transition-colors">
              {displayName}
            </span>

            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-medium text-[var(--text-muted)] opacity-85 leading-none">
                {displayRole}
              </span>
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}

export default Topbar;
