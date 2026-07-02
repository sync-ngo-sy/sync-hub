// frontend/src/components/DevPageSwitcher.tsx
import { useNavigate, useLocation } from "react-router-dom";

const DEV_PAGES = [
  { label: "Job List", path: "/jobs" },
  { label: "Job Create", path: "/jobs/new" },
  { label: "Job Detail", path: "/jobs/dummy-job-id" },
  { label: "Job Edit", path: "/jobs/dummy-job-id/edit" },
  { label: "Matching Run", path: "/jobs/dummy-job-id/runs/dummy-run-id" },
];

export function DevPageSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        maxWidth: 500,
        justifyContent: "flex-end",
      }}
    >
      {DEV_PAGES.map((page) => {
        const isActive = location.pathname === page.path;
        return (
          <button
            key={page.path}
            onClick={() => navigate(page.path)}
            style={{
              background: isActive ? "#50c1b8" : "#1e1e1f",
              color: isActive ? "#fff" : "#50c1b8",
              border: "1px solid #50c1b8",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
            }}
          >
            {page.label}
          </button>
        );
      })}
    </div>
  );
}
