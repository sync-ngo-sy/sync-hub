import { useEffect, useState } from "react";
import { Building2, ExternalLink, Mail, Phone } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateDetail, MatchSignals } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
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

export function CandidateDossierPage() {
  const { candidateId } = useParams();
  const location = useLocation();
  const { currentTenant, session, userEmail } = useAuth();
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const routeState = (location.state ?? {}) as DossierLocationState;
  const contextualMatchScore = typeof routeState.searchMatchScore === "number" ? routeState.searchMatchScore : null;

  useEffect(() => {
    if (!candidateId) {
      setCandidate(null);
      return;
    }

    let cancelled = false;
    platformApi.getCandidate(candidateId).then((nextCandidate) => {
      if (!cancelled) {
        setCandidate(nextCandidate);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (!candidateId) {
    return <EmptyState title="Candidate not selected" detail="Open a dossier from search results to inspect a real candidate profile." />;
  }

  if (!candidate) {
    return <EmptyState title="Loading dossier" detail="Fetching structured profile, summary, and evidence blocks." />;
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
            {contactMailto ? (
              <a className="button button--primary" href={contactMailto}>
                Contact candidate
              </a>
            ) : null}
          </div>
        }
      />

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
                <span className="tag">{candidate.yearsExperience} years experience</span>
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

          <Panel className="table-card">
            <div className="stack">
              <h3>CV preview map</h3>
              <ul className="bullet-list">
                {candidate.cvPreview.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p>This is wired as a metadata-ready preview area so the shared-hosted frontend can later open the original stored CV with a signed URL.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
