import type { PropsWithChildren } from 'react'
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/createTestQueryClient'

/** A fresh, isolated `QueryClient` per mount — for wrapping hooks/components under test. */
export function QueryClientTestProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => createTestQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
