export type DossierRow = {
  tenant_id: string;
  candidate_id: string;
  name: string;
  current_title: string | null;
  years_experience: number | null;
  seniority: string | null;
  top_skills: string[] | null;
  short_summary: string | null;
  long_summary: string | null;
  strengths: string[] | null;
  risks: string[] | null;
  recommended_roles: string[] | null;
};
