/**
 * Raw `compare` Edge Function payloads, exactly as the two verified backend
 * paths emit them:
 *
 * - `comparisonFreshFixture` — the flat, freshly computed response
 *   (`supabase/functions/compare/index.ts:103-111`).
 * - `comparisonCachedFixture` — the cached artifact response, whose
 *   `comparison` body is `dataclass_to_dict(ComparisonArtifact)` as written by
 *   `worker/src/cv_intelligence_worker/supabase.py:589-599`. Artifact items
 *   carry no dossier detail, which is why the canonical model models it as
 *   nullable.
 */
export const comparisonFreshFixture = {
  source: 'deterministic_fallback',
  overlap: ['kubernetes', 'go'],
  recommended_candidate_id: '22222222-2222-4222-8222-222222222222',
  items: [
    {
      tenant_id: '11111111-1111-4111-8111-111111111111',
      candidate_id: '22222222-2222-4222-8222-222222222222',
      name: 'Maya Hassan',
      current_title: 'Senior Platform Engineer',
      years_experience: 9,
      seniority: 'senior',
      score: 10.85,
      matched_skills: ['Kubernetes', 'Go'],
      gaps: ['Terraform'],
      strengths: ['Ran multi-region platform migrations'],
      risks: ['No recent people-management experience'],
      summary: 'Built reliable internal platforms for product teams.',
    },
    {
      tenant_id: '11111111-1111-4111-8111-111111111111',
      candidate_id: '33333333-3333-4333-8333-333333333333',
      name: 'Omar Farid',
      current_title: null,
      years_experience: 6,
      seniority: 'mid',
      score: 7.4,
      matched_skills: ['Go'],
      gaps: [],
      strengths: [],
      risks: [],
      summary: '',
    },
  ],
  meta: { compared_count: 2 },
}

export const comparisonCachedFixture = {
  source: 'cached_artifact',
  artifact_key: 'e3b0c44298fc1c149afbf4c8996fb924',
  artifact_version: '1.0.0',
  comparison: {
    tenant_id: '11111111-1111-4111-8111-111111111111',
    candidate_ids: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
    overall_summary:
      'Compared 2 candidates. Shared strengths center on kubernetes, go. Recommended candidate: Maya Hassan.',
    items: [
      {
        candidate_id: '22222222-2222-4222-8222-222222222222',
        score: 11.2,
        matched_skills: ['Kubernetes', 'Go'],
        gaps: ['Terraform'],
        evidence_refs: ['Acme Cloud', 'Nile Systems'],
      },
      {
        candidate_id: '33333333-3333-4333-8333-333333333333',
        score: 7.4,
        matched_skills: ['Go'],
        gaps: [],
        evidence_refs: [],
      },
    ],
    overlap: ['kubernetes', 'go'],
    recommended_candidate_id: '22222222-2222-4222-8222-222222222222',
    evidence_refs: ['Acme Cloud'],
    artifact_version: '1.0.0',
  },
}
