import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PanelRightOpen } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import type { CandidateDetail } from "@/lib/contracts";
import { parseChatCandidateIds } from "@/lib/chatAgent";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { Panel, Tag } from "@/components/ui";

import { chatStore } from "./chatStore";
import type { ChatStoreState, ChatTurn } from "./chatStore";
import { ChatThread } from "./ChatThread";
import { ChatComposer } from "./ChatComposer";
import { ContextDrawer } from "./ContextDrawer";

export { chatStore } from "./chatStore";

let lastProcessedPrefilledQuestion = "";

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

  const [searchParams, setSearchParams] = useSearchParams();
  const candidateIds = useMemo(() => parseChatCandidateIds(searchParams.get("ids")), [searchParams]);
  const prefilledQuestion = searchParams.get("q")?.trim() ?? "";
  const scopedMode = candidateIds.length > 0;

  const store = useSyncExternalStore(
    chatStore.subscribe,
    chatStore.getSnapshot
  ) as ChatStoreState;

  const [question, setQuestion] = useState(() => prefilledQuestion || store.question || "");
  const [contextCandidates, setContextCandidates] = useState<CandidateDetail[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loaderPhrase, setLoaderPhrase] = useState("SYNCING");

  const contextCandidateIds = scopedMode ? candidateIds : store.resolvedCandidateIds;

  useEffect(() => {
    chatStore.update({ hasUnreadResponse: false });
  }, []);

  useEffect(() => {
    chatStore.update({ question });
  }, [question]);

  useEffect(() => {
    if (prefilledQuestion && prefilledQuestion !== lastProcessedPrefilledQuestion) {
      lastProcessedPrefilledQuestion = prefilledQuestion;
      setQuestion(prefilledQuestion);
      chatStore.update({
        messages: [],
        resolvedCandidateIds: [],
        error: null,
        loadingAnswer: false,
        question: prefilledQuestion,
        hasUnreadResponse: false,
      });
    }
  }, [prefilledQuestion]);

  useEffect(() => {
    if (!store.loadingAnswer) return;
    const phrases = ["SYNCING", "THINKING", "ALMOST", "ANALYZING"];
    let idx = 0;
    setLoaderPhrase(phrases[0]);
    const interval = setInterval(() => {
      idx = (idx + 1) % phrases.length;
      setLoaderPhrase(phrases[idx]);
    }, 1000);
    return () => clearInterval(interval);
  }, [store.loadingAnswer]);

  useEffect(() => {
    if (!contextCandidateIds.length) {
      setContextCandidates([]);
      setLoadingContext(false);
      return;
    }
    let cancelled = false;
    setLoadingContext(true);
    Promise.all(contextCandidateIds.slice(0, 4).map((id: string) => platformApi.getCandidate(id)))
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
    return () => { cancelled = true; };
  }, [contextCandidateIds]);

  async function handleAsk(nextQuestion: string) {
    const normalizedQuestion = nextQuestion.trim();
    if (!normalizedQuestion || store.loadingAnswer) return;

    const userTurnId = `user-${Date.now()}`;
    const nextHistory: ChatTurn[] = [
      ...store.messages,
      { id: userTurnId, role: "user" as const, text: normalizedQuestion },
    ];
    const historyPayload = nextHistory.map((message: ChatTurn) => ({
      role: message.role,
      content: message.text,
    }));

    setQuestion("");
    chatStore.update({ loadingAnswer: true, error: null, messages: nextHistory, question: "" });

    const startTime = Date.now();

    try {
      const response = await platformApi.agent(
        normalizedQuestion,
        candidateIds,
        historyPayload,
        scopedMode ? undefined : resolvedTenantIds,
      );

      const elapsed = Date.now() - startTime;
      const minDuration = 3000;
      if (elapsed < minDuration) {
        await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
      }

      const assistantTurn: ChatTurn = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: response.answer,
        response,
      };

      const isOffChatRoute =
        !window.location.hash.startsWith("#/chat") &&
        !window.location.pathname.startsWith("/chat");

      chatStore.update({
        resolvedCandidateIds: response.meta.resolvedCandidateIds ?? [],
        messages: [...nextHistory, assistantTurn],
        loadingAnswer: false,
        hasUnreadResponse: isOffChatRoute,
      });

      const audio = new Audio("/ai-answer-done.mp3");
      audio.play()
        .then(() => { audio.onended = () => { audio.src = ""; audio.load(); }; })
        .catch((err) => { console.warn("Audio playback failed:", err); });

    } catch (nextError) {
      chatStore.update({
        error: nextError instanceof Error ? nextError.message : String(nextError),
        loadingAnswer: false,
      });
    }
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleResetThread = () => {
    setQuestion("");
    chatStore.update({
      messages: [],
      question: "",
      resolvedCandidateIds: [],
      error: null,
      loadingAnswer: false,
      hasUnreadResponse: false,
    });
    lastProcessedPrefilledQuestion = "";
    setSearchParams(new URLSearchParams());
  };

  const overflowCount = Math.max(0, contextCandidateIds.length - contextCandidates.length);
  const isSendDisabled = store.loadingAnswer || !question.trim();

  return (
    <div className="chat-page" style={{
      paddingTop: 0,
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      height: "calc(100vh - 140px)",
      minHeight: "500px",
      boxSizing: "border-box"
    }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        .chat-message { position: relative !important; padding: 12px 20px !important; }
        .chat-message p { margin: 0 !important; white-space: pre-wrap !important; }
        .copy-btn {
          position: absolute; top: 50%; transform: translateY(-50%);
          opacity: 0; transition: opacity 150ms ease, background-color 150ms ease, color 150ms ease;
          background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px; padding: 6px; color: var(--text-soft, #a1a1aa);
          cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;
        }
        .chat-message--user .copy-btn { left: -44px; right: auto; }
        .chat-message--assistant .copy-btn { right: -44px; left: auto; }
        .chat-message:hover .copy-btn { opacity: 1; }
        .copy-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(80, 193, 184, 0.25);
          color: rgba(80, 193, 184, 1);
        }
        .chat-context-card:hover { transform: none !important; }
        .reset-thread-transition {
          opacity: 0; max-width: 0px; overflow: hidden; pointer-events: none;
          display: inline-flex; align-items: center;
          transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1), max-width 250ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .reset-thread-transition--visible { opacity: 1; max-width: 150px; pointer-events: auto; }
        @keyframes bulletPulse {
          0%, 100% { opacity: 0.2; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .anim-bullet { animation: bulletPulse 1s infinite ease-in-out both; display: inline-block; font-weight: bold; font-size: 1.1rem; }
        .anim-bullet-1 { animation-delay: 0s; }
        .anim-bullet-2 { animation-delay: 0.2s; }
      `
      }} />

      <Panel className="chat-thread-panel chat-thread-panel--flex">
        <div className="chat-thread-panel__header" style={{ flexWrap: "wrap", gap: "1rem" }}>
          <div className="skill-list chat-thread-panel__meta" style={{ display: "flex", alignItems: "center" }}>
            {scopedMode ? (
              <button
                type="button"
                onClick={() => setContextOpen(true)}
                style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", display: "inline-flex", textAlign: "left" }}
                title="Click to view candidate context"
              >
                <Tag tone="primary">
                  Scoped mode · {contextCandidateIds.length} candidates in scope
                </Tag>
              </button>
            ) : (
              <Tag tone="primary">General mode</Tag>
            )}

            {!scopedMode ? (
              <Tag>{isAllScope ? `${workspaceOptions.length} workspaces` : currentWorkspace?.name ?? "Current workspace"}</Tag>
            ) : null}

            {store.messages.length ? (
              <Tag>{store.messages.filter((m: ChatTurn) => m.role === "assistant").length} answers</Tag>
            ) : null}
          </div>

          <div className="chat-thread-panel__actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              className="button button--secondary"
              type="button"
              aria-controls="chat-context-drawer"
              aria-expanded={contextOpen}
              onClick={() => setContextOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <PanelRightOpen size={14} />
              {contextCandidateIds.length ? `Context (${contextCandidateIds.length})` : "Context"}
            </button>

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

            <div className={`reset-thread-transition ${scopedMode ? "reset-thread-transition--visible" : ""}`}>
              <button
                type="button"
                className="button button--secondary"
                onClick={handleResetThread}
                title="Clear active thread"
                style={{ whiteSpace: "nowrap" }}
              >
                Reset thread
              </button>
            </div>
          </div>
        </div>

        <ChatThread
          store={store}
          scopedMode={scopedMode}
          loaderPhrase={loaderPhrase}
          copiedId={copiedId}
          onCopy={handleCopy}
        />
      </Panel>

      <ChatComposer
        question={question}
        scopedMode={scopedMode}
        isSendDisabled={isSendDisabled}
        error={store.error}
        onChange={setQuestion}
        onSubmit={(q) => void handleAsk(q)}
      />

      <ContextDrawer
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        contextCandidateIds={contextCandidateIds}
        contextCandidates={contextCandidates}
        loadingContext={loadingContext}
        overflowCount={overflowCount}
      />
    </div>
  );
}
