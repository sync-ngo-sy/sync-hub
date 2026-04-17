import { useEffect, useState } from "react";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { CandidateDetail } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { Avatar, EmptyState, PageIntro, Panel, ScorePill, Tag } from "@/components/ui";

export function CandidateDossierPage() {
  const { candidateId = "elena-rostova" } = useParams();
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);

  useEffect(() => {
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

  if (!candidate) {
    return <EmptyState title="Loading dossier" detail="Fetching structured profile, summary, and evidence blocks." />;
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Grounded candidate view"
        title={candidate.name}
        description={candidate.headline}
        actions={
          <div className="skill-list">
            <Link className="button button--secondary" to={`/compare?ids=${candidate.candidateId},marcus-thorne`}>
              Compare
            </Link>
            <button className="button button--primary" type="button">
              Contact candidate
            </button>
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
                <span className="tag">{candidate.yearsExperience} years experience</span>
                <span className="tag">{candidate.availability} availability</span>
              </div>
            </div>
          </div>
          <ScorePill score={candidate.matchScore} label="Search fit" />
        </div>

        <div className="meta-list">
          <span className="tag">
            <Mail size={14} />
            recruiter@candidate-mail.mock
          </span>
          <span className="tag">
            <Phone size={14} />
            +971 55 000 0000
          </span>
          {candidate.links.map((link) => (
            <span key={link} className="tag">
              <ExternalLink size={14} />
              {link}
            </span>
          ))}
        </div>
      </Panel>

      <div className="detail-grid">
        <div className="stack">
          <Panel className="timeline-card">
            <div className="stack">
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
                    <p className="muted">{entry.employer}</p>
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
