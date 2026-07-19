import { useQuery } from '@tanstack/react-query'
import { invokePlatform } from '@/lib/api/client'
import { parseAuthContext } from '@/lib/auth/api/authContext'

/**
 * Fetches the current user's tenant memberships + platform-admin flag.
 * Keyed by user id (not `scopeKey` — this query is what produces the scope
 * in the first place) so switching signed-in users refetches, while a token
 * refresh for the same user does not.
 */
export function useAuthContextQuery(userId: string | null) {
  return useQuery({
    queryKey: ['auth', 'context', userId],
    queryFn: async () => parseAuthContext(await invokePlatform('auth_context')),
    enabled: userId !== null,
  })
}
