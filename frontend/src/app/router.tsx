import { Navigate, createHashRouter } from "react-router-dom";
import { AuthGate } from "@/app/AuthGate";
import { AppShell } from "@/app/layout/AppShell";
import { protectedRoutes, publicRoutes } from "@/app/routeRegistry";
import { EmptyState } from "@/components/ui";
import { CandidateDossierPage } from "@/screens/CandidateDossierPage";
import { IntelligentComparisonPage } from "@/screens/IntelligentComparisonPage";
import { IntelligenceHubPage } from "@/screens/IntelligenceHubPage";
import { InsightsDashboardPage } from "@/screens/InsightsDashboardPage";
import { JobMatchingRunPage, JobPostingCreatePage, JobPostingDetailPage, JobPostingEditPage, JobPostingsPage } from "@/screens/JobPostingsPage";
import { PublicJobBoardPage, PublicJobDetailPage } from "@/screens/PublicJobBoardPage";
import { SearchConfigurationPage } from "@/screens/SearchConfigurationPage";
import { CandidateListingPage } from "@/screens/CandidateListingPage";
import { SearchDiscoveryPage } from "@/screens/SearchDiscoveryPage";
import { OpsAlertsPage } from "@/screens/admin/OpsAlertsPage";
import { ManatalSyncStatusPage } from "@/screens/admin/ManatalSyncStatusPage";
import { ParsingDetailPage } from "@/screens/admin/ParsingDetailPage";
import { ParsingLabPage } from "@/screens/admin/ParsingLabPage";
import { ParsingOverviewPage } from "@/screens/admin/ParsingOverviewPage";
import { AccountProvisioningPage } from "@/screens/admin/AccountProvisioningPage";
import { PlatformAdminDashboardPage } from "@/screens/admin/PlatformAdminDashboardPage";
import { PlatformRuntimeSettingsPage } from "@/screens/admin/PlatformRuntimeSettingsPage";

function ProtectedShell() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}

export const router = createHashRouter([
  ...publicRoutes,
  {
    path: "/",
    element: <ProtectedShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/search" replace />,
      },
      ...protectedRoutes,
      { path: "search", element: <SearchDiscoveryPage /> },
      { path: "candidates", element: <CandidateListingPage /> },
      { path: "chat", element: <IntelligenceHubPage /> },
      { path: "jobs", element: <JobPostingsPage /> },
      { path: "jobs/new", element: <JobPostingCreatePage /> },
      { path: "jobs/:jobId/edit", element: <JobPostingEditPage /> },
      { path: "jobs/:jobId", element: <JobPostingDetailPage /> },
      { path: "jobs/:jobId/runs/:runId", element: <JobMatchingRunPage /> },
      { path: "dossier/:candidateId", element: <CandidateDossierPage /> },
      { path: "compare", element: <IntelligentComparisonPage /> },
      { path: "insights", element: <InsightsDashboardPage /> },
      { path: "search-config", element: <Navigate to="/admin/search-simulator" replace /> },
      { path: "intelligence", element: <Navigate to="/chat" replace /> },
      { path: "analytics", element: <Navigate to="/insights" replace /> },
      { path: "admin", element: <PlatformAdminDashboardPage /> },
      { path: "admin/dashboard", element: <PlatformAdminDashboardPage /> },
      { path: "admin/accounts", element: <AccountProvisioningPage /> },
      { path: "admin/settings", element: <PlatformRuntimeSettingsPage /> },
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
