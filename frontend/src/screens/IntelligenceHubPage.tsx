import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, PanelRightOpen, Send, Sparkles, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import type { AgentResponse, CandidateDetail } from "@/lib/contracts";
import { buildChatHref, parseChatCandidateIds } from "@/lib/chatAgent";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { Avatar, Panel, Tag } from "@/components/ui";

type ChatTurn =
  | {
      id: string;
      role: "user";
      text: string;
    }
  | {
      id: string;
      role: "assistant";
      text: string;
      response: AgentResponse;
};

export function IntelligenceHubPage() {
  const {
    currentWorkspace,
    isAllScope,
    isPlatformAdmin,
    resolvedTenantIds,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();
  const [searchParams] = useSearchParams();
  const candidateIds = useMemo(() => parseChatCandidateIds(searchParams.get("ids")), [searchParams]);
  const prefilledQuestion = searchParams.get("q")?.trim() ?? "";
  const scopedMode = candidateIds.length > 0;
  const [question, setQuestion] = useState(prefilledQuestion);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [resolvedCandidateIds, setResolvedCandidateIds] = useState<string[]>([]);
  const [contextCandidates, setContextCandidates] = useState<CandidateDetail[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contextCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const contextCandidateIds = scopedMode ? candidateIds : resolvedCandidateIds;
  const scopeKey = resolvedTenantIds.join("|");

  useEffect(() => {
    setQuestion(prefilledQuestion || "");
    setMessages([]);
    setResolvedCandidateIds([]);
    setError(null);
    setLoadingAnswer(false);
  }, [prefilledQuestion]);

  useEffect(() => {
    if (scopedMode) {
      return;
    }

    setMessages([]);
    setResolvedCandidateIds([]);
    setError(null);
    setLoadingAnswer(false);
  }, [scopeKey, scopedMode]);

  useEffect(() => {
    if (!contextOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    contextCloseButtonRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextOpen]);

  useEffect(() => {
    if (!contextCandidateIds.length) {
      setContextCandidates([]);
      setLoadingContext(false);
      return;
    }

    let cancelled = false;
    setLoadingContext(true);

    Promise.all(contextCandidateIds.slice(0, 4).map((candidateId) => platformApi.getCandidate(candidateId)))
      .then((nextCandidates) => {
        if (!cancelled) {
          setContextCandidates(nextCandidates);
          setLoadingContext(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContextCandidates([]);
          setLoadingContext(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contextCandidateIds]);

  async function handleAsk(nextQuestion: string) {
    const normalizedQuestion = nextQuestion.trim();
    if (!normalizedQuestion || loadingAnswer) {
      return;
    }

    const userTurnId = `user-${Date.now()}`;
    const nextHistory = [...messages, { id: userTurnId, role: "user" as const, text: normalizedQuestion }];
    const historyPayload = nextHistory.map((message) => ({
      role: message.role,
      content: message.text,
    }));
    setLoadingAnswer(true);
    setError(null);
    setMessages(nextHistory);
    setQuestion("");

    try {
      const response = await platformApi.agent(
        normalizedQuestion,
        candidateIds,
        historyPayload,
        scopedMode ? undefined : resolvedTenantIds,
      );
      const assistantId = `assistant-${Date.now()}`;
      setResolvedCandidateIds(response.meta.resolvedCandidateIds ?? []);
      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          text: response.answer,
          response,
        },
      ]);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoadingAnswer(false);
    }
  }

  const overflowCount = Math.max(0, contextCandidateIds.length - contextCandidates.length);

  return (
    <div className="chat-page">
      <header className="chat-page__header">
        <div className="chat-page__identity">
          <span className="eyebrow">{scopedMode ? "Grounded recruiter assistant" : "General recruiter copilot"}</span>
          <h1>{scopedMode ? "Chat Agent" : "General Agent"}</h1>
          <p>
            {scopedMode
              ? "Ask follow-up questions over the selected candidates."
              : "Ask recruiting questions over the indexed corpus."}
          </p>
        </div>
        <div className="chat-page__actions">
          {!scopedMode ? (
            <PlatformScopeControl
              isPlatformAdmin={isPlatformAdmin}
              scopeMode={scopeMode}
              onChangeScopeMode={setScopeMode}
              currentWorkspace={currentWorkspace}
              workspaceOptions={workspaceOptions}
              onChangeWorkspace={setWorkspaceId}
            />
          ) : null}
        </div>
      </header>

      <Panel className="chat-thread-panel">
        <div className="chat-thread-panel__header">
          <div className="skill-list chat-thread-panel__meta">
            <Tag tone="primary">{scopedMode ? "Scoped mode" : "General mode"}</Tag>
            {!scopedMode ? <Tag>{isAllScope ? `${workspaceOptions.length} workspaces` : currentWorkspace?.name ?? "Current workspace"}</Tag> : null}
            <Tag>{contextCandidateIds.length} candidates in scope</Tag>
            {messages.length ? <Tag>{messages.filter((item) => item.role === "assistant").length} answers</Tag> : null}
          </div>
          <div className="chat-thread-panel__actions">
            <button
              className="button button--secondary"
              type="button"
              aria-controls="chat-context-drawer"
              aria-expanded={contextOpen}
              onClick={() => setContextOpen(true)}
            >
              <PanelRightOpen size={14} />
              {contextCandidateIds.length ? `Context (${contextCandidateIds.length})` : "Context"}
            </button>
            {scopedMode ? (
              <Link className="button button--secondary" to={buildChatHref(candidateIds)}>
                Reset thread
              </Link>
            ) : null}
          </div>
        </div>

        <div className="chat-thread">
          {!messages.length ? (
            <div className="chat-empty">
              <Bot size={18} />
              <div>
                <strong>Start the conversation</strong>
                <p>{prefilledQuestion ? "A starter question is loaded below. Edit it or send it as-is." : "Ask a recruiter question to begin."}</p>
              </div>
            </div>
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="chat-message chat-message--user">
                  <div className="chat-message__meta">
                    <span>You</span>
                  </div>
                  <p>{message.text}</p>
                </div>
              ) : (
                <div key={message.id} className="chat-message chat-message--assistant">
                  <div className="quote">
                    <Sparkles size={18} />
                    <span>{message.text}</span>
                  </div>

                  {message.response.citations.length ? (
                    <div className="stack">
                      <h4>Citations</h4>
                      <div className="evidence-list">
                        {message.response.citations.map((citation) => (
                          <div key={`${message.id}-${citation.id}`} className="evidence-card">
                            <div className="evidence-card__meta">
                              <span>{citation.chunkType}</span>
                              <span>{Math.round(citation.relevance * 100)}%</span>
                            </div>
                            <p>{citation.excerpt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ),
            )
          )}

          {loadingAnswer ? (
            <div className="chat-message chat-message--assistant">
              <div className="chat-message__meta">
                <Tag tone="primary">Thinking</Tag>
              </div>
              <p>Retrieving evidence and assembling a grounded answer.</p>
            </div>
          ) : null}
        </div>

        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAsk(question);
          }}
        >
          <textarea
            className="form-textarea"
            aria-label="Ask the recruiting agent"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !event.shiftKey) {
                return;
              }

              event.preventDefault();
              void handleAsk(question);
            }}
            placeholder={
              scopedMode
                ? "Ask why a candidate matches, where the gaps are, or how the shortlist compares."
                : "Ask a broad recruiting question like who fits backend, React, DevOps, or senior engineering work."
            }
          />
          <div className="chat-composer__actions">
            {error ? <p className="chat-composer__error">{error}</p> : <span />}
            <button className="button button--primary" type="submit" disabled={loadingAnswer || !question.trim()}>
              <Send size={15} />
              {loadingAnswer ? "Working..." : "Send"}
            </button>
          </div>
        </form>
      </Panel>

      {contextOpen ? (
        <>
          <div className="context-drawer-backdrop context-drawer-backdrop--open" onClick={() => setContextOpen(false)} />
          <aside id="chat-context-drawer" className="context-drawer context-drawer--open" role="dialog" aria-modal="true" aria-labelledby="chat-context-drawer-title">
            <div className="context-drawer__header">
              <div className="stack">
                <span className="eyebrow">Context</span>
                <h3 id="chat-context-drawer-title">Candidates in scope</h3>
              </div>
              <button ref={contextCloseButtonRef} className="icon-button" type="button" onClick={() => setContextOpen(false)} aria-label="Close context drawer">
                <X size={18} />
              </button>
            </div>

            <div className="context-drawer__body">
              <div className="chat-context-grid">
                {loadingContext ? (
                  <p className="muted">Loading candidate context…</p>
                ) : !contextCandidateIds.length ? (
                  <p className="muted">No shortlist has been derived yet.</p>
                ) : (
                  contextCandidates.map((candidate) => (
                    <Link key={candidate.candidateId} className="chat-context-card" to={`/dossier/${candidate.candidateId}`} onClick={() => setContextOpen(false)}>
                      <div className="candidate-card__identity">
                        <Avatar name={candidate.name} hue={candidate.avatarHue} size="sm" />
                        <div className="stack">
                          <strong>{candidate.name}</strong>
                          <p>{candidate.currentTitle}</p>
                        </div>
                      </div>
                      <div className="skill-list">
                        <Tag>{candidate.seniority}</Tag>
                        <Tag tone="primary">{candidate.primaryRole}</Tag>
                      </div>
                    </Link>
                  ))
                )}
                {overflowCount > 0 ? <Tag>+{overflowCount} more in scope</Tag> : null}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
