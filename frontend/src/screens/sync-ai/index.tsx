import {useEffect, useMemo, useState, useSyncExternalStore} from "react";
import {useSearchParams} from "react-router-dom";
import type {CandidateDetail} from "@/lib/contracts";
import {parseChatCandidateIds} from "@/lib/chatAgent";
import {platformApi} from "@/lib/platformApi";
import {usePlatformScope} from "@/lib/platformScope";
import {useAuth} from "@/lib/auth";

import {chatStore} from "./chatStore";
import type {ChatStoreState, ChatTurn} from "./chatStore";
import {ChatThread} from "./ChatThread";
import {ChatComposer} from "./ChatComposer";
import {ContextDrawer} from "./ContextDrawer";
import {ChatMetaRow} from "./ChatMetaRow";

export {chatStore} from "./chatStore";

let lastProcessedPrefilledQuestion = "";

function deriveFirstName(email?: string | null): string {
  if (!email) return "there";
  const local = email.split("@")[0] ?? "";
  const token = local.split(/[.\-_]/)[0] ?? local;
  if (!token) return "there";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

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

  const {userEmail} = useAuth();
  const firstName = useMemo(() => deriveFirstName(userEmail), [userEmail]);

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
  const hasMessages = store.messages.length > 0;

  useEffect(() => {
    chatStore.update({hasUnreadResponse: false});
  }, []);

  useEffect(() => {
    chatStore.update({question});
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
    return () => {
      cancelled = true;
    };
  }, [contextCandidateIds]);

  async function handleAsk(nextQuestion: string) {
    const normalizedQuestion = nextQuestion.trim();
    if (!normalizedQuestion || store.loadingAnswer) return;

    const userTurnId = `user-${Date.now()}`;
    const nextHistory: ChatTurn[] = [
      ...store.messages,
      {id: userTurnId, role: "user" as const, text: normalizedQuestion},
    ];
    const historyPayload = nextHistory.map((message: ChatTurn) => ({
      role: message.role,
      content: message.text,
    }));

    setQuestion("");
    chatStore.update({loadingAnswer: true, error: null, messages: nextHistory, question: ""});

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
        .then(() => {
          audio.onended = () => {
            audio.src = "";
            audio.load();
          };
        })
        .catch((err) => {
          console.warn("Audio playback failed:", err);
        });

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
    <div
      style={{
        position: "relative",
        height: "calc(100vh - 140px)",
        minHeight: "500px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <style dangerouslySetInnerHTML={{__html: SYNC_AI_STYLES}}/>

      {/* Ambient backdrop glow, purely decorative — matches reference */}
      <div className="sync-ai-ambient" aria-hidden="true"/>

      {/* Slide animation stage: row1 = thread (always 1fr), row2 = composer block (auto),
                row3 = bottom spacer that collapses from 1fr -> 0fr once messages exist,
                which pushes all the leftover space into row1 and slides the composer to the bottom. */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: `minmax(0, 1fr) auto minmax(0, ${hasMessages ? 0 : 1}fr)`,
          transition: "grid-template-rows 460ms cubic-bezier(0.4, 0, 0.2, 1)",
          height: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Row 1: thread */}
        <div
          style={{
            minHeight: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {hasMessages ? (
            <ChatThread
              store={store}
              scopedMode={scopedMode}
              loaderPhrase={loaderPhrase}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          ) : null}
        </div>

        {/* Row 2: greeting (collapses) + composer + meta row */}
        <div style={{width: "100%", maxWidth: "760px", margin: "0 auto", padding: "clamp(12px, 2.5vw, 28px) clamp(12px, 3vw, 20px) clamp(16px, 3vw, 28px)", boxSizing: "border-box"}}>
          <div
            style={{
              display: "grid",
              gridTemplateRows: hasMessages ? "0fr" : "1fr",
              transition: "grid-template-rows 380ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <div style={{overflow: "hidden"}}>
              <h1
                style={{
                  textAlign: "center",
                  fontSize: "clamp(1.5rem, 3vw, 2.05rem)",
                  fontWeight: 500,
                  color: "var(--text)",
                  margin: "0 0 22px",
                  letterSpacing: "-0.01em",
                  opacity: hasMessages ? 0 : 1,
                  transition: "opacity 220ms ease",
                }}
              >
                What can I help with, {firstName}?
              </h1>
            </div>
          </div>

          <ChatComposer
            question={question}
            scopedMode={scopedMode}
            isSendDisabled={isSendDisabled}
            error={store.error}
            onChange={setQuestion}
            onSubmit={(q) => void handleAsk(q)}
          />

          <ChatMetaRow
            scopedMode={scopedMode}
            contextCandidateIds={contextCandidateIds}
            isAllScope={isAllScope}
            workspaceOptions={workspaceOptions}
            currentWorkspace={currentWorkspace}
            answersCount={store.messages.filter((m: ChatTurn) => m.role === "assistant").length}
            isPlatformAdmin={isPlatformAdmin}
            scopeMode={scopeMode}
            setScopeMode={setScopeMode}
            setWorkspaceId={setWorkspaceId}
            onOpenContext={() => setContextOpen(true)}
            onResetThread={handleResetThread}
          />
        </div>

        {/* Row 3: bottom spacer — animates 1fr -> 0fr */}
        <div/>
      </div>

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

const SYNC_AI_STYLES = `
  .sync-ai-ambient {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(560px 360px at 50% 38%, rgba(80, 193, 184, 0.10), transparent 70%);
    z-index: 0;
  }
  .sync-ai-textarea::placeholder { color: var(--text-soft); opacity: 0.55; }
  .sync-ai-icon-btn:hover { background: rgba(255, 255, 255, 0.07) !important; }
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
  @keyframes bulletPulse {
    0%, 100% { opacity: 0.2; transform: scale(0.9); }
    50% { opacity: 1; transform: scale(1.15); }
  }
  .anim-bullet { animation: bulletPulse 1s infinite ease-in-out both; display: inline-block; font-weight: bold; font-size: 1.1rem; }
  .anim-bullet-1 { animation-delay: 0s; }
  .anim-bullet-2 { animation-delay: 0.2s; }
`;
