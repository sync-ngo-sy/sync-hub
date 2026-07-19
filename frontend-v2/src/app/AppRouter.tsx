/* eslint-disable react-refresh/only-export-components -- route objects and the browser router must be stable module singletons, not React component exports. */
import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { AppShell } from '@/app/AppShell'
import { RequireAdmin, RequireAuth } from '@/app/RouteGuards'
import { RouteErrorBoundary } from '@/lib/errors/ErrorBoundaries'

type LazyPage = ReturnType<typeof lazy>

function routeFallback() {
  return (
    <section className="space-y-5" aria-label="Loading page">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </section>
  )
}

function LazyRoute({ page: Page }: { page: LazyPage }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={routeFallback()}>
        <Page />
      </Suspense>
    </RouteErrorBoundary>
  )
}

function lazyNamed<T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  name: keyof T,
) {
  return lazy(async () => {
    const module = await loader()
    return { default: module[name] }
  })
}

function lazyPlaceholder(title: string, detail?: string) {
  return lazy(async () => {
    const { RoutePlaceholderPage } = await import('@/app/RoutePlaceholderPage')
    return { default: () => <RoutePlaceholderPage title={title} detail={detail} /> }
  })
}

const authScreens = () => import('@/features/auth/pages/AuthScreens')
const SignInPage = lazyNamed(authScreens, 'SignInScreen')
const CareersPage = lazyPlaceholder(
  'Careers',
  'Browse current openings and learn more about working with us.',
)
const CareerDetailPage = lazyPlaceholder('Open position')
const CandidatePage = lazyPlaceholder('Candidate directory')
const SearchPage = lazyPlaceholder('Talent pool')
const JobsPage = lazyPlaceholder('Job postings')
const InsightsPage = lazyPlaceholder('Insights')
const ChatPage = lazyPlaceholder('SYNC AI')
const ComparePage = lazyPlaceholder('Intelligent comparison')
const SettingsPage = lazyPlaceholder('Account settings')
const DossierPage = lazyPlaceholder('Candidate dossier')
const AdminDashboardPage = lazyPlaceholder('Platform dashboard')
const AdminAccountsPage = lazyPlaceholder('Account provisioning')
const AdminSettingsPage = lazyPlaceholder('Runtime settings')
const AdminAlertsPage = lazyPlaceholder('Ops alerts')
const AdminSyncPage = lazyPlaceholder('Manatal sync')
const AdminSearchPage = lazyPlaceholder('Search simulator')
const AdminParsingPage = lazyPlaceholder('Parsing quality')
const AdminParsingLabPage = lazyPlaceholder('Parsing lab')
const AdminParsingDetailPage = lazyPlaceholder('Parsing detail')
const NotFoundPage = lazyPlaceholder(
  'Route not found',
  'This address does not match a page in SYNC.',
)

function lazyElement(page: LazyPage) {
  return <LazyRoute page={page} />
}

export function createAppRoutes(): RouteObject[] {
  return [
    {
      path: '/',
      children: [
        { index: true, element: <Navigate to="/candidates" replace /> },
        { path: 'sign-in', element: lazyElement(SignInPage) },
        { path: 'careers', element: lazyElement(CareersPage) },
        { path: 'careers/:slug', element: lazyElement(CareerDetailPage) },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppShell />,
              children: [
                {
                  path: 'search',
                  element: lazyElement(SearchPage),
                  handle: {
                    title: 'Talent Pool',
                    subtitle: 'Search structured candidate profiles and grounded evidence',
                  },
                },
                {
                  path: 'candidates',
                  element: lazyElement(CandidatePage),
                  handle: {
                    title: 'Candidates',
                    subtitle: 'Browse, filter, and group your talent pool',
                  },
                },
                {
                  path: 'chat',
                  element: lazyElement(ChatPage),
                  handle: { title: 'SYNC AI', subtitle: 'Grounded recruiter Q&A' },
                },
                {
                  path: 'settings',
                  element: lazyElement(SettingsPage),
                  handle: {
                    title: 'Account Settings',
                    subtitle: 'Manage workspace and session preferences',
                  },
                },
                {
                  path: 'jobs',
                  element: lazyElement(JobsPage),
                  handle: {
                    title: 'Job Postings',
                    subtitle: 'Manage roles, applications, and matching runs',
                  },
                },
                {
                  path: 'jobs/new',
                  element: lazyElement(JobsPage),
                  handle: { title: 'Create Job Posting' },
                },
                {
                  path: 'jobs/:jobId/edit',
                  element: lazyElement(JobsPage),
                  handle: { title: 'Edit Job Posting' },
                },
                {
                  path: 'jobs/:jobId',
                  element: lazyElement(JobsPage),
                  handle: { title: 'Job Posting' },
                },
                {
                  path: 'jobs/:jobId/runs/:runId',
                  element: lazyElement(JobsPage),
                  handle: { title: 'Matching Run' },
                },
                {
                  path: 'dossier/:candidateId',
                  element: lazyElement(DossierPage),
                  handle: {
                    title: 'Candidate Dossier',
                    subtitle: 'Grounded profile, skills, and evidence',
                  },
                },
                {
                  path: 'compare',
                  element: lazyElement(ComparePage),
                  handle: {
                    title: 'Intelligent Comparison',
                    subtitle: 'Compare candidates side by side',
                  },
                },
                {
                  path: 'insights',
                  element: lazyElement(InsightsPage),
                  handle: { title: 'Insights', subtitle: 'Corpus intelligence and skills gaps' },
                },
                {
                  path: 'search-config',
                  element: <Navigate to="/admin/search-simulator" replace />,
                },
                { path: 'intelligence', element: <Navigate to="/chat" replace /> },
                { path: 'analytics', element: <Navigate to="/insights" replace /> },
                {
                  element: <RequireAdmin />,
                  children: [
                    {
                      path: 'admin',
                      element: lazyElement(AdminDashboardPage),
                      handle: { title: 'Platform Dashboard' },
                    },
                    {
                      path: 'admin/dashboard',
                      element: lazyElement(AdminDashboardPage),
                      handle: { title: 'Platform Dashboard' },
                    },
                    {
                      path: 'admin/accounts',
                      element: lazyElement(AdminAccountsPage),
                      handle: { title: 'Account Provisioning' },
                    },
                    {
                      path: 'admin/settings',
                      element: lazyElement(AdminSettingsPage),
                      handle: { title: 'Runtime Settings' },
                    },
                    {
                      path: 'admin/alerts',
                      element: lazyElement(AdminAlertsPage),
                      handle: { title: 'Alerts' },
                    },
                    {
                      path: 'admin/manatal-sync',
                      element: lazyElement(AdminSyncPage),
                      handle: { title: 'Manatal Sync Status' },
                    },
                    {
                      path: 'admin/search-simulator',
                      element: lazyElement(AdminSearchPage),
                      handle: { title: 'Search Simulator' },
                    },
                    {
                      path: 'admin/parsing',
                      element: lazyElement(AdminParsingPage),
                      handle: { title: 'Parsing Quality' },
                    },
                    {
                      path: 'admin/parsing/lab',
                      element: lazyElement(AdminParsingLabPage),
                      handle: { title: 'Parsing Lab' },
                    },
                    {
                      path: 'admin/parsing/:documentId',
                      element: lazyElement(AdminParsingDetailPage),
                      handle: { title: 'Parsing Detail' },
                    },
                    { path: 'admin/*', element: <Navigate to="/admin" replace /> },
                  ],
                },
                {
                  path: '*',
                  element: lazyElement(NotFoundPage),
                  handle: { title: 'Route Not Found' },
                },
              ],
            },
          ],
        },
      ],
    },
  ]
}

export const appRouter = createBrowserRouter(createAppRoutes())
