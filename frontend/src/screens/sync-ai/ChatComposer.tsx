import { ArrowUp } from "lucide-react";

type Props = {
  question: string;
  scopedMode: boolean;
  isSendDisabled: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (question: string) => void;
};

export function ChatComposer({ question, scopedMode, isSendDisabled, error, onChange, onSubmit }: Props) {
  return (
    <div style={{
      width: "100%",
      padding: "8px 0 12px",
      boxSizing: "border-box",
      flexShrink: 0
    }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(question);
        }}
        style={{
          maxWidth: "720px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "9999px",
          padding: "6px 8px 6px 20px",
          boxSizing: "border-box"
        }}
      >
        <textarea
          className="form-textarea"
          aria-label="Ask the recruiting agent"
          value={question}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (event.shiftKey || event.ctrlKey || event.metaKey) return;
              event.preventDefault();
              if (!isSendDisabled) onSubmit(question);
            }
          }}
          placeholder={
            scopedMode
              ? "Why a candidate matches? where the gaps are? how the shortlist compares?"
              : "Who fits backend, React, DevOps, or senior engineering work?"
          }
          style={{
            flex: "1",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            padding: "8px 0",
            margin: "0",
            height: "36px",
            minHeight: "36px",
            maxHeight: "120px",
            color: "inherit",
            fontSize: "0.95rem",
            lineHeight: "1.4",
            boxShadow: "none"
          }}
        />

        <button
          type="submit"
          disabled={isSendDisabled}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            cursor: isSendDisabled ? "not-allowed" : "pointer",
            transition: "all 180ms ease-in-out",
            padding: "0",
            background: isSendDisabled ? "rgba(255, 255, 255, 0.04)" : "rgba(80, 193, 184, 0.14)",
            border: isSendDisabled ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(80, 193, 184, 0.25)",
            color: isSendDisabled ? "rgba(255, 255, 255, 0.2)" : "rgba(80, 193, 184, 1)",
            opacity: isSendDisabled ? 0.5 : 1
          }}
        >
          <ArrowUp size={16} />
        </button>
      </form>

      {error && (
        <p className="chat-composer__error" style={{ textAlign: "center", marginTop: "8px" }}>
          {error}
        </p>
      )}
    </div>
  );
}
