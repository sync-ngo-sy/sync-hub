import { lazy, Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/authContextStore'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

const AccessPendingScreen = lazy(async () => {
  const module = await import('@/features/auth/pages/AuthScreens')
  return { default: module.AccessPendingScreen }
})
const LoadingScreen = lazy(async () => {
  const module = await import('@/features/auth/pages/AuthScreens')
  return { default: module.LoadingScreen }
})
const NotConfiguredScreen = lazy(async () => {
  const module = await import('@/features/auth/pages/AuthScreens')
  return { default: module.NotConfiguredScreen }
})
const PasswordRecoveryScreen = lazy(async () => {
  const module = await import('@/features/auth/pages/AuthScreens')
  return { default: module.PasswordRecoveryScreen }
})

function authScreen(screen: React.ReactNode) {
  return <Suspense fallback={<main className="min-h-svh bg-background" />}>{screen}</Suspense>
}

export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()

  if (!auth.configured) {
    return authScreen(<NotConfiguredScreen />)
  }
  if (auth.loading) {
    return authScreen(<LoadingScreen />)
  }
  if (auth.authError) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Authentication could not be checked</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{getUserErrorMessage(auth.authError)}</p>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }
  if (auth.passwordRecovery) {
    return authScreen(<PasswordRecoveryScreen />)
  }
  if (!auth.session) {
    return <Navigate to="/sign-in" state={{ returnTo: location.pathname }} replace />
  }
  if (auth.memberships.length === 0 && !auth.isPlatformAdmin) {
    return authScreen(<AccessPendingScreen />)
  }

  return <Outlet />
}

export function RequireAdmin() {
  const { isPlatformAdmin } = useAuth()

  if (!isPlatformAdmin) {
    return (
      <section className="mx-auto max-w-2xl py-12">
        <Alert variant="destructive">
          <h2 className="font-medium">Access denied</h2>
          <AlertDescription>
            This area is available only to platform administrators. Your account has not been
            granted that role.
          </AlertDescription>
        </Alert>
      </section>
    )
  }

  return <Outlet />
}
