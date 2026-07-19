import type { PropsWithChildren } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { ErrorFallback } from '@/lib/errors/ErrorFallback'

export function AppErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary
      FallbackComponent={(props) => <ErrorFallback {...props} catastrophic />}
      onReset={() => window.location.reload()}
    >
      {children}
    </ErrorBoundary>
  )
}

export function RouteErrorBoundary({ children }: PropsWithChildren) {
  return <ErrorBoundary FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>
}
