import type { PropsWithChildren } from 'react'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** A fresh, isolated `QueryClient` per mount — for wrapping hooks/components under test. */
export function QueryClientTestProvider({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
        },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
