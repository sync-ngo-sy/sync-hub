import { useState } from 'react'
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useMatches } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/authContextStore'

const routeHandleSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
})

const workspaceNavigation = [
  { to: '/search', label: 'Talent Pool', icon: Search },
  { to: '/candidates', label: 'Candidates', icon: Users },
  { to: '/jobs', label: 'Job Postings', icon: BriefcaseBusiness },
  { to: '/insights', label: 'Insights', icon: LineChart },
  { to: '/chat', label: 'SYNC AI', icon: Bot },
  { to: '/compare', label: 'Comparison', icon: GitCompareArrows },
]

const adminNavigation = [
  { to: '/admin', label: 'Platform', icon: LayoutDashboard },
  { to: '/admin/accounts', label: 'Accounts', icon: Building2 },
]

function ShellNavigation({ onNavigate }: { onNavigate: () => void }) {
  const { isPlatformAdmin } = useAuth()

  return (
    <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1 px-3 py-5">
      {workspaceNavigation.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`
          }
        >
          <item.icon className="size-4" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}

      {isPlatformAdmin ? (
        <>
          <p className="caption-label mb-2 mt-6 px-3">Administration</p>
          {adminNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              end={item.to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`
              }
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </>
      ) : null}
    </nav>
  )
}

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const matches = useMatches()
  const { currentTenant, user, signOut } = useAuth()
  const matchedHandle = [...matches]
    .reverse()
    .map((match) => routeHandleSchema.safeParse(match.handle))
    .find((result) => result.success)
  const routeChrome = matchedHandle?.success ? matchedHandle.data : null

  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <a
          href="/candidates"
          className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6"
          aria-label="SYNC home"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
            S
          </span>
          <span className="text-base font-medium tracking-[-0.03em]">SYNC</span>
        </a>
        <ShellNavigation onNavigate={() => undefined} />
        <div className="border-t border-sidebar-border p-4">
          <Button
            className="w-full justify-start"
            type="button"
            variant="ghost"
            onClick={() => void signOut()}
          >
            <LogOut aria-hidden="true" /> Sign out
          </Button>
        </div>
      </aside>

      {navigationOpen ? (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm lg:hidden">
          <aside className="flex h-full w-[min(20rem,88vw)] flex-col border-r border-sidebar-border bg-sidebar">
            <div className="flex h-20 items-center justify-between border-b border-sidebar-border px-5">
              <span className="text-base font-medium">SYNC</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setNavigationOpen(false)}
                aria-label="Close navigation"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <ShellNavigation onNavigate={() => setNavigationOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 flex min-h-20 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setNavigationOpen(true)}
            aria-label="Open navigation"
          >
            <Menu aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-medium tracking-[-0.025em]">
              {routeChrome?.title ?? 'SYNC'}
            </h1>
            {routeChrome?.subtitle ? (
              <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">
                {routeChrome.subtitle}
              </p>
            ) : null}
          </div>
          <div className="hidden items-center gap-2 text-right sm:flex">
            <div>
              <p className="text-sm">{currentTenant?.name ?? 'All companies'}</p>
              <p className="text-xs text-muted-foreground">{user?.email ?? 'Platform admin'}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
              <Bell aria-hidden="true" />
            </Button>
            <Button asChild variant="ghost" size="icon">
              <NavLink to="/settings" aria-label="Settings">
                <Settings aria-hidden="true" />
              </NavLink>
            </Button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
