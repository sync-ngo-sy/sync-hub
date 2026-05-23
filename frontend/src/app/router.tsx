import { Navigate, createHashRouter } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { EmptyState } from "@/components/ui";
import { CandidateDossierPage } from "@/screens/CandidateDossierPage";
import { IntelligentComparisonPage } from "@/screens/IntelligentComparisonPage";
import { IntelligenceHubPage } from "@/screens/IntelligenceHubPage";
import { SearchConfigurationPage } from "@/screens/SearchConfigurationPage";
import { SearchDiscoveryPage } from "@/screens/SearchDiscoveryPage";
import { OpsAlertsPage } from "@/screens/admin/OpsAlertsPage";
import { ManatalSyncStatusPage } from "@/screens/admin/ManatalSyncStatusPage";
import { ParsingDetailPage } from "@/screens/admin/ParsingDetailPage";
import { ParsingLabPage } from "@/screens/admin/ParsingLabPage";
import { ParsingOverviewPage } from "@/screens/admin/ParsingOverviewPage";
import { PlatformAdminDashboardPage } from "@/screens/admin/PlatformAdminDashboardPage";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/search" replace />,
      },
      { path: "search", element: <SearchDiscoveryPage /> },
      { path: "chat", element: <IntelligenceHubPage /> },
      { path: "dossier/:candidateId", element: <CandidateDossierPage /> },
      { path: "compare", element: <IntelligentComparisonPage /> },
      { path: "search-config", element: <Navigate to="/admin/search-simulator" replace /> },
      { path: "intelligence", element: <Navigate to="/chat" replace /> },
      { path: "analytics", element: <Navigate to="/search" replace /> },
      { path: "admin", element: <PlatformAdminDashboardPage /> },
      { path: "admin/dashboard", element: <PlatformAdminDashboardPage /> },
      { path: "admin/alerts", element: <OpsAlertsPage /> },
      { path: "admin/manatal-sync", element: <ManatalSyncStatusPage /> },
      { path: "admin/search-simulator", element: <SearchConfigurationPage /> },
      { path: "admin/parsing/lab", element: <ParsingLabPage /> },
      { path: "admin/parsing", element: <ParsingOverviewPage /> },
      { path: "admin/parsing/:documentId", element: <ParsingDetailPage /> },
      { path: "admin/*", element: <Navigate to="/admin" replace /> },
      {
        path: "*",
        element: (
          <div className="page-stack">
            <EmptyState title="Route not found" detail="This screen has not been mapped into the frontend router yet." />
          </div>
        ),
      },
    ],
  },
]);
