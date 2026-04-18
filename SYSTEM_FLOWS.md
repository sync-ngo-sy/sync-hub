# CV Intelligence Platform Flows

## 1. Offline Ingestion Flow
1. CVs are collected from folders, storage systems, or external sources.
2. Documents are parsed into raw text.
3. Structured candidate data is extracted from each CV.
4. Skills, roles, and seniority are normalized.
5. CV content is split into logical searchable sections.
6. Embeddings are generated for each section.
7. Candidate profiles and intelligence artifacts are stored in Supabase.

## 2. Search and Retrieval Flow
1. Recruiter submits a natural language search query with optional filters.
2. The system extracts structured intent such as role, skills, seniority, and experience.
3. Structured filters reduce the candidate pool.
4. Lexical and vector retrieval search the indexed candidate content.
5. Retrieved evidence is aggregated at the candidate level.
6. Candidates are ranked and returned with score and supporting signals.

## 3. Candidate Review Flow
1. Recruiter opens a candidate dossier.
2. The system returns the structured candidate profile, parsed sections, and supporting evidence.
3. Recruiter reviews candidate summary, skills, experience timeline, and source CV.

## 4. Comparison Flow
1. Recruiter selects multiple candidates.
2. The system compares them side by side using structured and retrieved evidence.
3. It highlights overlaps, gaps, and the strongest recommendation.

## 5. AI Insight Flow
1. AI is applied only after retrieval.
2. The system uses retrieved evidence to explain why a candidate matches.
3. It generates grounded summaries, comparisons, and recruiter-facing insights.
4. This keeps outputs controlled, explainable, and tied to source data.
