import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

export function CareersQueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>{getUserErrorMessage(error)}</p>
        <Button type="button" variant="outline" onClick={retry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  )
}
