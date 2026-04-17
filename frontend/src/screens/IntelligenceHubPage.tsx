import { useEffect, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { defaultIntelligenceIds } from "@/data/mockData";
import type { AskResponse } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { EmptyState, PageIntro, Panel, Tag } from "@/components/ui";

const cannedQuestions = [
  "Why are these candidates strong fits for the backend search?",
  "What are the main gaps across the shortlist?",
  "Compare their experience against multi-tenant platform work.",
];

export function IntelligenceHubPage() {
  const [question, setQuestion] = useState(cannedQuestions[0]);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    platformApi.ask(question, defaultIntelligenceIds).then((nextResponse) => {
      if (!cancelled) {
        setResponse(nextResponse);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [question]);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="RAG after retrieval"
        title="Intelligence hub"
        description="Ask bounded questions over selected candidates after retrieval has already narrowed the context. Answers stay concise, structured, and tied to stored evidence blocks."
      />

      <div className="hero-grid">
        <Panel className="hero-panel">
          <div className="stack">
            <Tag tone="primary">Supported intents</Tag>
            <h2>Bounded questions only.</h2>
            <p>Use the intelligence hub for “why matched”, strengths, gaps, experience summaries, and grounded compare questions. This avoids mixing retrieval and reasoning in the same step.</p>
          </div>
          <div className="panel__section" style={{ marginTop: 24 }}>
            <textarea className="form-textarea" value={question} onChange={(event) => setQuestion(event.target.value)} />
          </div>
          <div className="question-pills">
            {cannedQuestions.map((item) => (
              <button key={item} className="button button--secondary" onClick={() => setQuestion(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="filters-panel">
          <div className="panel__section">
            <span>Selected candidates</span>
            <div className="skill-list">
              {defaultIntelligenceIds.map((candidateId) => (
                <Tag key={candidateId}>{candidateId}</Tag>
              ))}
            </div>
          </div>
          <div className="panel__section">
            <span>Reasoning mode</span>
            <div className="skill-list">
              <Tag tone="primary">Grounded</Tag>
              <Tag>Structured output</Tag>
              <Tag>No live hallucination</Tag>
            </div>
          </div>
        </Panel>
      </div>

      {loading || !response ? (
        <EmptyState title="Preparing evidence pack" detail="Collecting grounded facts and citations from the selected candidate set." />
      ) : (
        <div className="two-column-grid">
          <Panel className="table-card">
            <div className="stack">
              <div className="skill-list">
                <Tag tone="primary">{response.intent}</Tag>
                <Tag>{response.meta.candidateCount} candidates</Tag>
              </div>
              <h3>Extractive answer</h3>
              <div className="quote">
                <Bot size={18} />
                <span>{response.extractiveAnswer}</span>
              </div>
              <h3>Facts</h3>
              <ul className="bullet-list">
                {response.facts.map((fact) => (
                  <li key={`${fact.candidateId}-${fact.fact}`}>{fact.fact}</li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <div className="skill-list">
                <Sparkles size={16} />
                <strong>Citations</strong>
              </div>
              <div className="evidence-list">
                {response.citations.map((citation) => (
                  <div key={citation.id} className="evidence-card">
                    <div className="evidence-card__meta">
                      <span>{citation.chunkType}</span>
                      <span>{Math.round(citation.relevance * 100)}%</span>
                    </div>
                    <p>{citation.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
