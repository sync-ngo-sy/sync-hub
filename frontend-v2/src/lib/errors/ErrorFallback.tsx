import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

interface ErrorFallbackProps {
  error: unknown
  resetErrorBoundary: () => void
  catastrophic?: boolean
}

export function ErrorFallback({
  error,
  resetErrorBoundary,
  catastrophic = false,
}: ErrorFallbackProps) {
  const message = getUserErrorMessage(error)

  return (
    <section
      className={
        catastrophic
          ? 'flex min-h-svh items-center justify-center p-6'
          : 'mx-auto flex w-full max-w-3xl items-center justify-center py-12'
      }
      aria-label="Application error"
    >
      <Alert variant="destructive" className="max-w-xl">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>
          {catastrophic ? 'The app could not start' : 'This page could not load'}
        </AlertTitle>
        <AlertDescription className="space-y-4">
          <p>{message}</p>
          <Button type="button" variant="outline" onClick={resetErrorBoundary}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  )
}
