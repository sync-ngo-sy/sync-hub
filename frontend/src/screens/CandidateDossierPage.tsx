import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, FileText, Mail, Phone } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateDetail, MatchSignals } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
import { formatYearsExperience } from "@/lib/experience";
import { platformApi } from "@/lib/platformApi";
import { Avatar, EmptyState, PageIntro, Panel, ScorePill, Tag } from "@/components/ui";

type DossierLocationState = {
  searchMatchScore?: number;
  searchMatchSignals?: MatchSignals;
  searchQuery?: string;
};

function toExternalHref(link: string) {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function buildManatalCandidateUrl(manatalCandidateId?: string | null) {
  if (!manatalCandidateId) {
    return null;
  }
  const baseUrl = (import.meta.env.VITE_MANATAL_APP_BASE_URL?.trim() || "https://app.manatal.com/candidates").replace(/\/+$/, "");
  return `${baseUrl}/${encodeURIComponent(manatalCandidateId)}`;
}

function candidateFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function recruiterDisplayName(email: string | null | undefined, metadata: Record<string, unknown>) {
  const explicitName = [metadata.full_name, metadata.name, metadata.display_name, metadata.recruiter_name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean);

  if (explicitName) {
    return explicitName;
  }

  const emailHandle = (email ?? "").split("@")[0]?.trim();
  return emailHandle ? titleCaseWords(emailHandle) : "Recruiter";
}

function recruiterPhone(metadata: Record<string, unknown>, sessionPhone?: string | null) {
  const candidates = [sessionPhone, metadata.phone, metadata.phone_number, metadata.mobile]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return candidates[0] ?? null;
}

function buildContactMailto(
  candidate: CandidateDetail,
  recruiter: { name: string; company: string; email: string | null; phone: string | null },
  searchQuery?: string,
) {
  if (!candidate.email) {
    return null;
  }

  const firstName = candidateFirstName(candidate.name);
  const roleContext = searchQuery?.trim() || candidate.currentTitle || "a role on our team";
  const subject = `Opportunity to discuss ${roleContext}`;
  const body = [
    `Dear ${firstName},`,
    "",
    `I hope you're doing well.`,
    "",
    `My name is ${recruiter.name}, and I'm reaching out from ${recruiter.company}.`,
    "",
    `I came across your profile while reviewing candidates for ${roleContext}, and your background stood out.`,
    "",
    "I would love to schedule a short conversation to introduce the opportunity and learn more about your current interests.",
    "",
    "If you are open to it, please let me know a suitable time to connect.",
    "",
    "Best regards,",
    recruiter.name,
    recruiter.company,
    ...(recruiter.email ? [recruiter.email] : []),
    ...(recruiter.phone ? [recruiter.phone] : []),
  ].join("\n");

  return `mailto:${candidate.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function DossierSkeleton() {
  return (
    <div className="page-stack dossier-skeleton" aria-busy="true" aria-label="Loading candidate dossier">
      <section className="dossier-skeleton__intro">
        <div className="stack">
          <span className="stat-card__skeleton dossier-skeleton__eyebrow" />
          <span className="stat-card__skeleton dossier-skeleton__title" />
          <span className="stat-card__skeleton dossier-skeleton__subtitle" />
        </div>
        <div className="dossier-skeleton__actions">
          {Array.from({ length: 4 }).map((_, index) => (
            <span key={index} className="stat-card__skeleton dossier-skeleton__button" />
          ))}
        </div>
      </section>

      <Panel className="candidate-card dossier-skeleton__profile">
        <div className="candidate-profile__header">
          <div className="candidate-profile__identity">
            <span className="stat-card__skeleton dossier-skeleton__avatar" />
            <div className="stack dossier-skeleton__identity">
              <div className="skill-list">
                {Array.from({ length: 3 }).map((_, index) => (
                  <span key={index} className="stat-card__skeleton dossier-skeleton__pill" />
                ))}
              </div>
              <span className="stat-card__skeleton dossier-skeleton__heading" />
              <span className="stat-card__skeleton dossier-skeleton__line dossier-skeleton__line--medium" />
              <div className="meta-list">
                <span className="stat-card__skeleton dossier-skeleton__tag" />
                <span className="stat-card__skeleton dossier-skeleton__tag" />
              </div>
            </div>
          </div>
          <span className="stat-card__skeleton dossier-skeleton__score" />
        </div>

        <div className="meta-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <span key={index} className="stat-card__skeleton dossier-skeleton__tag" />
          ))}
        </div>
      </Panel>

      <div className="detail-grid">
        <div className="stack">
          <Panel className="timeline-card dossier-skeleton__panel">
            <span className="stat-card__skeleton dossier-skeleton__eyebrow" />
            <span className="stat-card__skeleton dossier-skeleton__heading" />
            <span className="stat-card__skeleton dossier-skeleton__line" />
            <span className="stat-card__skeleton dossier-skeleton__line" />
            <span className="stat-card__skeleton dossier-skeleton__line dossier-skeleton__line--short" />
          </Panel>

          <Panel className="timeline-card dossier-skeleton__panel">
            <span className="stat-card__skeleton dossier-skeleton__heading" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="dossier-skeleton__timeline-entry">
                <span className="stat-card__skeleton dossier-skeleton__line dossier-skeleton__line--medium" />
                <span className="stat-card__skeleton dossier-skeleton__line dossier-skeleton__line--short" />
                <span className="stat-card__skeleton dossier-skeleton__line" />
              </div>
            ))}
          </Panel>
        </div>

        <div className="stack">
          <Panel className="table-card dossier-skeleton__panel">
            <span className="stat-card__skeleton dossier-skeleton__heading" />
            <div className="skill-list">
              {Array.from({ length: 8 }).map((_, index) => (
                <span key={index} className="stat-card__skeleton dossier-skeleton__pill" />
              ))}
            </div>
          </Panel>

          <Panel className="table-card dossier-skeleton__panel">
            <span className="stat-card__skeleton dossier-skeleton__heading" />
            {Array.from({ length: 5 }).map((_, index) => (
              <span key={index} className="stat-card__skeleton dossier-skeleton__line" />
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export function CandidateDossierPage() {
  const { candidateId } = useParams();
  const location = useLocation();
  const { currentTenant, isAdmin, session, userEmail } = useAuth();
  const routeState = (location.state ?? {}) as DossierLocationState;
  const contextualMatchScore = typeof routeState.searchMatchScore === "number" ? routeState.searchMatchScore : null;
  const candidateQuery = useQuery({
    queryKey: ["candidate-dossier", candidateId],
    queryFn: () => platformApi.getCandidate(candidateId as string),
    enabled: Boolean(candidateId),
    staleTime: 10 * 60 * 1000,
    gcTime: 45 * 60 * 1000,
    refetchOnMount: false,
  });
  const candidate = candidateQuery.data ?? null;
  const manatalCandidateIdQuery = useQuery({
    queryKey: ["candidate-manatal-id", candidateId],
    queryFn: () => platformApi.getManatalCandidateId(candidateId as string),
    enabled: Boolean(candidateId && isAdmin),
    staleTime: 10 * 60 * 1000,
  });
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [openOriginalError, setOpenOriginalError] = useState<string | null>(null);

  if (!candidateId) {
    return <EmptyState title="Candidate not selected" detail="Open a dossier from search results to inspect a real candidate profile." />;
  }

  if (!candidate) {
    if (candidateQuery.isError) {
      return (
        <EmptyState
          title="Dossier failed to load"
          detail={candidateQuery.error instanceof Error ? candidateQuery.error.message : "Unable to fetch this candidate dossier."}
          action={
            <button className="button button--secondary" type="button" onClick={() => void candidateQuery.refetch()}>
              Retry
            </button>
          }
        />
      );
    }

    return <DossierSkeleton />;
  }

  const userMetadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const recruiter = {
    name: recruiterDisplayName(userEmail, userMetadata),
    company: currentTenant?.name ?? "your team",
    email: userEmail,
    phone: recruiterPhone(userMetadata, session?.user.phone ?? null),
  };
  const contactMailto = buildContactMailto(candidate, recruiter, routeState.searchQuery);
  const currentEmployer = candidate.timeline[0]?.employer?.trim() || null;
  const canOpenOriginal = Boolean(candidate.storagePath || candidate.sourceUri || candidate.cvUrl);
  const manatalCandidateId = candidate.manatalCandidateId ?? manatalCandidateIdQuery.data ?? null;
  const manatalUrl = isAdmin ? buildManatalCandidateUrl(manatalCandidateId) : null;

  async function handleOpenOriginalCv() {
    if (!candidate || openingOriginal) {
      return;
    }

    setOpeningOriginal(true);
    setOpenOriginalError(null);

    try {
      const documentUrl = await platformApi.getOriginalDocumentUrl(candidate.storagePath, candidate.sourceUri ?? candidate.cvUrl, {
        candidateId: candidate.candidateId,
        tenantId: currentTenant?.id,
      });
      if (!documentUrl) {
        throw new Error("The original CV is not available from browser-accessible storage yet.");
      }
      window.open(documentUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setOpenOriginalError(error instanceof Error ? error.message : "Unable to open the original CV.");
    } finally {
      setOpeningOriginal(false);
    }
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Grounded candidate view"
        title={candidate.name}
        description={candidate.headline}
        actions={
          <div className="skill-list">
            <Link className="button button--secondary" to="/search">
              Back to Search
            </Link>
            <Link
              className="button button--secondary"
              to={buildChatHref([candidate.candidateId], routeState.searchQuery || "Why is this candidate a strong fit?")}
            >
              Ask Agent
            </Link>
            {canOpenOriginal ? (
              <button className="button button--secondary" type="button" onClick={() => void handleOpenOriginalCv()} disabled={openingOriginal}>
                <FileText size={16} />
                {openingOriginal ? "Opening..." : "Open CV"}
              </button>
            ) : null}
            {manatalUrl ? (
              <a className="button button--secondary" href={manatalUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={16} />
                Open in Manatal
              </a>
            ) : null}
            {contactMailto ? (
              <a className="button button--primary" href={contactMailto}>
                Contact candidate
              </a>
            ) : null}
          </div>
        }
      />
      {openOriginalError ? <p className="form-error">{openOriginalError}</p> : null}

      <Panel className="candidate-card">
        <div className="candidate-profile__header">
          <div className="candidate-profile__identity">
            <Avatar name={candidate.name} hue={candidate.avatarHue} size="lg" />
            <div className="stack">
              <div className="skill-list">
                <Tag tone="primary">{candidate.seniority}</Tag>
                <Tag>{candidate.primaryRole}</Tag>
                <Tag tone="success">{candidate.stage}</Tag>
              </div>
              <h2>{candidate.currentTitle}</h2>
              <p>{candidate.location}</p>
              <div className="meta-list">
                {currentEmployer ? (
                  <span className="tag">
                    <Building2 size={14} />
                    {currentEmployer}
                  </span>
                ) : null}
                <span className="tag">{formatYearsExperience(candidate.yearsExperience)} experience</span>
              </div>
            </div>
          </div>
          {contextualMatchScore !== null ? <ScorePill score={contextualMatchScore} label="Current search fit" /> : null}
        </div>

        <div className="meta-list">
          {contactMailto ? (
            <a className="tag" href={contactMailto}>
              <Mail size={14} />
              {candidate.email}
            </a>
          ) : null}
          {candidate.phone ? (
            <a className="tag" href={`tel:${candidate.phone}`}>
              <Phone size={14} />
              {candidate.phone}
            </a>
          ) : null}
          {canOpenOriginal ? (
            <button className="tag" type="button" onClick={() => void handleOpenOriginalCv()} disabled={openingOriginal}>
              <FileText size={14} />
              {candidate.originalFilename ?? "Original CV"}
            </button>
          ) : null}
          {manatalUrl ? (
            <a className="tag" href={manatalUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={14} />
              Manatal {manatalCandidateId}
            </a>
          ) : null}
          {candidate.links.map((link) => (
            <a key={link} className="tag" href={toExternalHref(link)} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={14} />
              {link}
            </a>
          ))}
        </div>
      </Panel>

      <div className="detail-grid">
        <div className="stack">
          <Panel className="timeline-card">
            <div className="stack">
              {routeState.searchQuery ? (
                <>
                  <span className="eyebrow">Search context</span>
                  <p className="muted">Opened from search: {routeState.searchQuery}</p>
                </>
              ) : null}
              <span className="eyebrow">AI summary</span>
              <h3>Executive synthesis</h3>
              <p>{candidate.longSummary}</p>
            </div>
          </Panel>

          <Panel className="timeline-card">
            <div className="stack">
              <h3>Career timeline</h3>
              <div className="timeline">
                {candidate.timeline.map((entry) => (
                  <div key={`${entry.employer}-${entry.role}`} className="timeline-entry">
                    <div className="signal-row">
                      <strong>{entry.role}</strong>
                      <span>
                        {entry.start} - {entry.end}
                      </span>
                    </div>
                    <p className="muted timeline-entry__employer">
                      <Building2 size={14} />
                      {entry.employer}
                    </p>
                    <p className="muted">{entry.scope}</p>
                    <ul className="bullet-list">
                      {entry.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="timeline-card">
            <div className="stack">
              <h3>Projects and accomplishments</h3>
              <ul className="bullet-list">
                {candidate.projects.map((project) => (
                  <li key={project}>{project}</li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel className="table-card">
            <div className="stack">
              <h3>Top skills</h3>
              <div className="skill-list">
                {candidate.topSkills.map((skill) => (
                  <Tag key={skill} tone="primary">
                    {skill}
                  </Tag>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <h3>Strengths</h3>
              <ul className="bullet-list">
                {candidate.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>Risks</h3>
              <ul className="bullet-list">
                {candidate.risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <h3>Supporting evidence</h3>
              <div className="evidence-list">
                {candidate.evidence.map((evidence) => (
                  <div key={evidence.id} className="evidence-card">
                    <div className="evidence-card__meta">
                      <span>{evidence.chunkType}</span>
                      <span>{Math.round(evidence.relevance * 100)}% relevance</span>
                    </div>
                    <p>{evidence.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
