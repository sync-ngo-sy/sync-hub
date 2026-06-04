import { Navigate } from "react-router-dom";
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  FileText,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui";
import { CandidateDossierPage } from "@/screens/CandidateDossierPage";
import { IntelligentComparisonPage } from "@/screens/IntelligentComparisonPage";
import { IntelligenceHubPage } from "@/screens/IntelligenceHubPage";
import { InsightsDashboardPage } from "@/screens/InsightsDashboardPage";
import { JobMatchingRunPage, JobPostingCreatePage, JobPostingDetailPage, JobPostingEditPage, JobPostingsPage } from "@/screens/JobPostingsPage";
import { PublicJobBoardPage, PublicJobDetailPage } from "@/screens/PublicJobBoardPage";
import { SearchConfigurationPage } from "@/screens/SearchConfigurationPage";
import { SearchDiscoveryPage } from "@/screens/SearchDiscoveryPage";
import { AccountProvisioningPage } from "@/screens/admin/AccountProvisioningPage";
import { ManatalSyncStatusPage } from "@/screens/admin/ManatalSyncStatusPage";
import { OpsAlertsPage } from "@/screens/admin/OpsAlertsPage";
import { ParsingDetailPage, ParsingLabPage } from "@/features/parsing";
import { ParsingOverviewPage } from "@/screens/admin/ParsingOverviewPage";
import { PlatformAdminDashboardPage } from "@/screens/admin/PlatformAdminDashboardPage";
import { PlatformRuntimeSettingsPage } from "@/screens/admin/PlatformRuntimeSettingsPage";

type RegisteredRoute = {
  path: string;
  element: JSX.Element;
  subtitle?: string;
  title?: string;
};

export type NavigationItem = {
  icon: LucideIcon;
  label: string;
  match: (path: string) => boolean;
  to: string;
};

export const publicRoutes: RegisteredRoute[] = [
  { path: "/careers", element: <PublicJobBoardPage /> },
  { path: "/careers/:slug", element: <PublicJobDetailPage /> },
];

export const protectedRoutes: RegisteredRoute[] = [
  { path: "search", element: <SearchDiscoveryPage />, title: "Search & Discovery", subtitle: "Hybrid retrieval over structured profiles and chunk-level evidence" },
  { path: "chat", element: <IntelligenceHubPage />, title: "General Agent", subtitle: "Grounded recruiter Q&A over corpus-derived or explicitly scoped candidate sets" },
  { path: "jobs", element: <JobPostingsPage />, title: "Job Postings", subtitle: "Internal roles, AI requirement extraction, persisted candidate matching runs, and named shortlists" },
  { path: "jobs/new", element: <JobPostingCreatePage />, title: "Job Postings", subtitle: "Internal roles, AI requirement extraction, persisted candidate matching runs, and named shortlists" },
  { path: "jobs/:jobId/edit", element: <JobPostingEditPage />, title: "Job Postings", subtitle: "Internal roles, AI requirement extraction, persisted candidate matching runs, and named shortlists" },
  { path: "jobs/:jobId", element: <JobPostingDetailPage />, title: "Job Postings", subtitle: "Internal roles, AI requirement extraction, persisted candidate matching runs, and named shortlists" },
  { path: "jobs/:jobId/runs/:runId", element: <JobMatchingRunPage />, title: "Job Postings", subtitle: "Internal roles, AI requirement extraction, persisted candidate matching runs, and named shortlists" },
  { path: "dossier/:candidateId", element: <CandidateDossierPage />, title: "Candidate Dossier", subtitle: "Grounded profile view with timeline, skills, and supporting evidence" },
  { path: "compare", element: <IntelligentComparisonPage />, title: "Intelligent Comparison", subtitle: "Side-by-side recommendation with grounded overlap and gaps" },
  { path: "insights", element: <InsightsDashboardPage />, title: "Insights", subtitle: "Read-only corpus intelligence, job-family distribution, skills gaps, and seniority mix" },
  { path: "search-config", element: <Navigate to="/admin/search-simulator" replace /> },
  { path: "intelligence", element: <Navigate to="/chat" replace /> },
  { path: "analytics", element: <Navigate to="/insights" replace /> },
  { path: "admin", element: <PlatformAdminDashboardPage />, title: "Platform Dashboard", subtitle: "Cross-workspace admin view for corpus volume, tenant coverage, and parser rollout health" },
  { path: "admin/dashboard", element: <PlatformAdminDashboardPage />, title: "Platform Dashboard", subtitle: "Cross-workspace admin view for corpus volume, tenant coverage, and parser rollout health" },
  { path: "admin/accounts", element: <AccountProvisioningPage />, title: "Account provisioning", subtitle: "Invite users, create tenants, and manage workspace access" },
  { path: "admin/settings", element: <PlatformRuntimeSettingsPage />, title: "Runtime settings", subtitle: "Operational settings for extraction, retrieval, and model behavior" },
  { path: "admin/alerts", element: <OpsAlertsPage />, title: "Alerts", subtitle: "Active Supabase health findings and acknowledgement state" },
  { path: "admin/manatal-sync", element: <ManatalSyncStatusPage />, title: "Manatal Sync Status", subtitle: "Queue state, GCS original coverage, and recent Manatal ingestion activity" },
  { path: "admin/search-simulator", element: <SearchConfigurationPage />, title: "Search Simulator", subtitle: "Live search-debug trace with exact request payloads, intent resolution, embeddings, and raw ranked rows" },
  { path: "admin/parsing/lab", element: <ParsingLabPage />, title: "Parsing Lab", subtitle: "Versioned parser profiles, prompts, and publish controls for the offline worker" },
  { path: "admin/parsing", element: <ParsingOverviewPage />, title: "Parsing Quality", subtitle: "Operational view of CV field coverage, confidence, and parser diagnostics" },
  { path: "admin/parsing/:documentId", element: <ParsingDetailPage />, title: "Parsing Detail", subtitle: "Per-document extraction diagnostics with field-level coverage and optimization hints" },
  { path: "admin/*", element: <Navigate to="/admin" replace /> },
  {
    path: "*",
    element: (
      <div className="page-stack">
        <EmptyState title="Route not found" detail="This screen has not been mapped into the frontend router yet." />
      </div>
    ),
  },
];

export const workspaceNavigation: NavigationItem[] = [
  { to: "/search", label: "Search & Discovery", icon: Search, match: (path) => path === "/search" },
  { to: "/jobs", label: "Job Postings", icon: BriefcaseBusiness, match: (path) => path.startsWith("/jobs") },
  { to: "/insights", label: "Insights", icon: LineChart, match: (path) => path === "/insights" },
  { to: "/chat", label: "General Agent", icon: Bot, match: (path) => path === "/chat" },
  { to: "/compare", label: "Intelligent Comparison", icon: GitCompareArrows, match: (path) => path === "/compare" },
];

export const adminNavigation: NavigationItem[] = [
  { to: "/admin", label: "Platform Dashboard", icon: LayoutDashboard, match: (path) => path === "/admin" || path === "/admin/dashboard" },
  { to: "/admin/accounts", label: "Account provisioning", icon: UserPlus, match: (path) => path === "/admin/accounts" },
  { to: "/admin/settings", label: "Runtime settings", icon: Settings2, match: (path) => path === "/admin/settings" },
  { to: "/admin/alerts", label: "Alerts", icon: Bell, match: (path) => path === "/admin/alerts" },
  { to: "/admin/manatal-sync", label: "Manatal Sync", icon: RefreshCw, match: (path) => path === "/admin/manatal-sync" },
  { to: "/admin/search-simulator", label: "Search Simulator", icon: SlidersHorizontal, match: (path) => path === "/admin/search-simulator" },
  {
    to: "/admin/parsing",
    label: "Parsing Quality",
    icon: FileText,
    match: (path) => path === "/admin/parsing" || (path.startsWith("/admin/parsing/") && path !== "/admin/parsing/lab"),
  },
  { to: "/admin/parsing/lab", label: "Parsing Lab", icon: FlaskConical, match: (path) => path === "/admin/parsing/lab" },
];

export function routeChromeForPath(path: string) {
  return protectedRoutes.find((route) => route.title && matchRoutePattern(route.path, path)) ?? protectedRoutes[0];
}

function matchRoutePattern(pattern: string, path: string) {
  const normalizedPattern = `/${pattern}`.replace(/\/+/g, "/");
  const patternParts = normalizedPattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}
