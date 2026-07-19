import { QueryClient } from '@tanstack/react-query'

/**
 * The single React Query client for the app. Every feature query key starts
 * with `[domain, scopeKey, ...params]` (`@/lib/auth/useTenantScope`), so
 * switching company/scope changes the key and refetches automatically —
 * there is no manual `queryClient.clear()` on scope or auth change. A full
 * clear is reserved for sign-out only (`@/lib/auth/AuthProvider`), which is
 * a security requirement: one user must never see another's cached data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
