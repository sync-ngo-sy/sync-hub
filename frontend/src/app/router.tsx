import { Navigate, createHashRouter } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { EmptyState } from "@/components/ui";
import { AnalyticsInsightsPage } from "@/screens/AnalyticsInsightsPage";
import { CandidateDossierPage } from "@/screens/CandidateDossierPage";
import { IntelligenceHubPage } from "@/screens/IntelligenceHubPage";
import { IntelligentComparisonPage } from "@/screens/IntelligentComparisonPage";
import { SearchConfigurationPage } from "@/screens/SearchConfigurationPage";
import { SearchDiscoveryPage } from "@/screens/SearchDiscoveryPage";
import { AccessManagementPage } from "@/screens/admin/AccessManagementPage";
import { DataManagementPage } from "@/screens/admin/DataManagementPage";
import { IndexingWorkbenchPage } from "@/screens/admin/IndexingWorkbenchPage";
import { SystemHealthPage } from "@/screens/admin/SystemHealthPage";

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
      { path: "search-config", element: <SearchConfigurationPage /> },
      { path: "dossier/:candidateId", element: <CandidateDossierPage /> },
      { path: "compare", element: <IntelligentComparisonPage /> },
      { path: "intelligence", element: <IntelligenceHubPage /> },
      { path: "analytics", element: <AnalyticsInsightsPage /> },
      { path: "admin/health", element: <SystemHealthPage /> },
      { path: "admin/data", element: <DataManagementPage /> },
      { path: "admin/indexing", element: <IndexingWorkbenchPage /> },
      { path: "admin/access", element: <AccessManagementPage /> },
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
