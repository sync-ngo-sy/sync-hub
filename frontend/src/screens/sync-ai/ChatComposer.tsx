import {useEffect, useRef, useState} from "react";
import {ArrowUp, Mic, MicOff} from "lucide-react";

type Props = {
  question: string;
  scopedMode: boolean;
  isSendDisabled: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (question: string) => void;
};

export function ChatComposer({
                               question,
                               scopedMode,
                               isSendDisabled,
                               error,
                               onChange,
                               onSubmit,
                             }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const questionRef = useRef(question);
  const isListeningRef = useRef(false);
  questionRef.current = question;

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicSupported(false);
      return;
    }
    setMicSupported(true);

    const recognition = new SpeechRecognition();
    // Keep listening continuously until the user manually stops
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      // Only take final results to avoid appending interim/partial words mid-sentence
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (!finalTranscript) return;
      const current = questionRef.current;
      const joined = current ? `${current} ${finalTranscript}` : finalTranscript;
      // Capitalize first letter
      const capitalized = joined.charAt(0).toUpperCase() + joined.slice(1);
      onChange(capitalized);
    };

    recognition.onend = () => {
      // If the user has NOT manually stopped, restart automatically
      // This handles the browser auto-stopping after a pause
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started — ignore
        }
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      // "no-speech" is not a real error — just restart if still listening
      if (event.error === "no-speech") {
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch {
            // Already started — ignore
          }
        }
        return;
      }
      // Any other error — stop cleanly
      isListeningRef.current = false;
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      isListeningRef.current = false;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // Already stopped — ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = () => {
    if (!micSupported || !recognitionRef.current) return;
    if (isListening) {
      // User manually stops
      isListeningRef.current = false;
      setIsListening(false);
      try {
        recognitionRef.current.stop();
      } catch {
        // Already stopped — ignore
      }
    } else {
      // User manually starts
      isListeningRef.current = true;
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch {
        // Already running — ignore
      }
    }
  };

  return (
    <div style={{width: "100%", boxSizing: "border-box"}}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(question);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#1e1e1f",
          border: "none",
          borderRadius: "9999px",
          padding: "6px 8px 6px 20px",
          boxSizing: "border-box",
          boxShadow: "0 16px 34px rgba(0, 0, 0, 0.28)",
        }}
      >
                <textarea
                  className="sync-ai-textarea"
                  aria-label="Ask the recruiting agent"
                  rows={1}
                  autoCapitalize="sentences"
                  value={question}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const capitalized = raw.length > 0
                      ? raw.charAt(0).toUpperCase() + raw.slice(1)
                      : raw;
                    onChange(capitalized);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      if (event.shiftKey || event.ctrlKey || event.metaKey) return;
                      event.preventDefault();
                      if (!isSendDisabled) onSubmit(question);
                    }
                  }}
                  placeholder={
                    scopedMode
                      ? "Why a candidate matches? Where the gaps are? How the shortlist compares?"
                      : "Who fits backend, React, DevOps, or senior engineering work?"
                  }
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    padding: 0,
                    margin: 0,
                    display: "block",
                    color: "var(--text)",
                    fontSize: "0.95rem",
                    lineHeight: "38px",
                    height: "38px",
                    maxHeight: "120px",
                    boxShadow: "none",
                    boxSizing: "border-box",
                  }}
                />

        {/* Mic button — shows MicOff when actively listening so user knows clicking stops it */}
        <button
          type="button"
          onClick={toggleListening}
          disabled={!micSupported}
          title={
            !micSupported
              ? "Voice input not supported in this browser"
              : isListening
                ? "Click to stop listening"
                : "Click to speak your question"
          }
          className="sync-ai-icon-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            flexShrink: 0,
            border: "none",
            cursor: !micSupported ? "not-allowed" : "pointer",
            background: isListening ? "rgba(80, 193, 184, 0.16)" : "transparent",
            color: isListening ? "var(--primary)" : "#ffffff",
            opacity: micSupported ? 1 : 0.4,
            transition: "background-color 180ms ease, color 180ms ease",
          }}
        >
          {isListening ? <MicOff size={22}/> : <Mic size={22}/>}
        </button>

        <button
          type="submit"
          disabled={isSendDisabled}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            cursor: isSendDisabled ? "not-allowed" : "pointer",
            transition: "background-color 180ms ease, color 180ms ease, opacity 180ms ease",
            padding: 0,
            flexShrink: 0,
            background: isSendDisabled ? "#2d2d2e" : "var(--primary)",
            border: "none",
            color: isSendDisabled ? "var(--text-muted)" : "#1c1c1d",
            opacity: isSendDisabled ? 0.6 : 1,
          }}
        >
          <ArrowUp size={17}/>
        </button>
      </form>

      {error && (
        <p style={{
          textAlign: "center",
          color: "#f87171",
          fontSize: "0.85rem",
          margin: "10px 0 0",
        }}>
          {error}
        </p>
      )}
    </div>
  );
}
