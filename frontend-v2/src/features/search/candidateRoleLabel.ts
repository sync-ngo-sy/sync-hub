interface CandidateRoleSource {
  currentTitle: string
  primaryRole: string | null
}

/**
 * The recruiter-facing role label for a candidate: their current title if we
 * have one, otherwise their primary role, otherwise a neutral placeholder.
 * Shared by every surface that lists candidates (search results, the
 * shortlist, the compare selection dialog) so the placeholder never drifts.
 */
export function candidateRoleLabel(candidate: CandidateRoleSource): string {
  if (candidate.currentTitle.length > 0) {
    return candidate.currentTitle
  }
  return candidate.primaryRole ?? 'Role not available'
}
