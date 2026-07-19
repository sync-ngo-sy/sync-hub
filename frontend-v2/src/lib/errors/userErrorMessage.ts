import { ApiError } from '@/lib/api/client'

const genericErrorMessage = 'Something went wrong. Please try again.'

type ErrorLogger = (message: string, error: unknown) => void

const logUnexpectedError: ErrorLogger = (message, error) => {
  console.error(message, error)
}

export function getUserErrorMessage(
  error: unknown,
  logger: ErrorLogger = logUnexpectedError,
): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'Your session has expired. Please sign in again.'
      case 403:
        return 'You do not have permission to do that.'
      case 404:
        return 'We could not find what you requested.'
      case 409:
        return 'That change conflicts with a newer update. Refresh and try again.'
      case 429:
        return 'Too many requests. Please wait a moment and try again.'
    }
  }

  logger('Unexpected application error', error)
  return genericErrorMessage
}
