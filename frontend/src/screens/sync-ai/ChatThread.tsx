import {useEffect, useRef} from "react";
import {Copy, Check} from "lucide-react";
import type {ChatStoreState, ChatTurn} from "./chatStore";

type Props = {
  store: ChatStoreState;
  scopedMode: boolean;
  loaderPhrase: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
};

function renderFormattedText(text: string) {
  if (!text) return "";
  const parts = text.split(/(\*\*.*?\*\*|\*[^*]+?\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <strong key={index}>{part.slice(1, -1)}</strong>;
    }
    return part;
  });
}

export function ChatThread({store, scopedMode, loaderPhrase, copiedId, onCopy}: Props) {
  const chatThreadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTo({
        top: chatThreadRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [store.messages, store.loadingAnswer]);

  return (
    <div
      ref={chatThreadRef}
      className="chat-thread"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        width: "100%",
        padding: "20px 24px 8px",
        boxSizing: "border-box",
      }}
    >
      {!store.messages.length ? (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flex: 1,
          padding: "4rem 1rem"
        }}>
          <p style={{
            fontSize: "1.05rem",
            fontWeight: 500,
            color: "var(--text-muted, #71717a)",
            textAlign: "center",
            margin: 0
          }}>
            {scopedMode
              ? "Ask follow-up questions over the selected candidates."
              : "Ask recruiting questions over the indexed corpus."}
          </p>
        </div>
      ) : (
        store.messages.map((message: ChatTurn) =>
          message.role === "user" ? (
            <div
              key={message.id}
              className="chat-message chat-message--user"
              style={{width: "fit-content", maxWidth: "80%", alignSelf: "flex-end"}}
            >
              <p>{renderFormattedText(message.text)}</p>
              <button
                type="button"
                className="copy-btn"
                onClick={() => onCopy(message.id, message.text)}
                title="Copy message to clipboard"
              >
                {copiedId === message.id ? <Check size={14}/> : <Copy size={14}/>}
              </button>
            </div>
          ) : (
            <div
              key={message.id}
              className="chat-message chat-message--assistant"
              style={{width: "fit-content", maxWidth: "85%", alignSelf: "flex-start"}}
            >
              <p>{message.text}</p>
              <button
                type="button"
                className="copy-btn"
                onClick={() => onCopy(message.id, message.text)}
                title="Copy message to clipboard"
              >
                {copiedId === message.id ? <Check size={14}/> : <Copy size={14}/>}
              </button>

              {message.response.citations.length ? (
                <div className="stack" style={{
                  marginTop: "16px",
                  borderTop: "1px solid rgba(255, 255, 255, 0.04)",
                  paddingTop: "12px"
                }}>
                  <h4 style={{
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-soft)",
                    margin: "0 0 8px"
                  }}>
                    Citations
                  </h4>
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
          )
        )
      )}

      {store.loadingAnswer ? (
        <div
          className="chat-message chat-message--assistant"
          style={{width: "fit-content", alignSelf: "flex-start"}}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            color: "rgba(80, 193, 184, 1)",
            fontSize: "0.9rem",
            fontWeight: "bold"
          }}>
            <span>{loaderPhrase}</span>
            <span className="anim-bullet anim-bullet-1" style={{marginLeft: "4px"}}>•</span>
            <span className="anim-bullet anim-bullet-2">•</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
