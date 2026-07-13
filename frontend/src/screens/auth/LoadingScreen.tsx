import {Loader2} from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="auth-loading-screen select-none" aria-live="polite" aria-busy="true">
      <div className="auth-loading auth-loading--minimal select-none">
        <div className="auth-loading__spinner shadow-lg shadow-[var(--primary)]/5">
          <Loader2 className="spin" size={24}/>
        </div>
        <span className="font-semibold text-[13px] tracking-wide uppercase text-[var(--text-soft)]">
                    Authentication..
                </span>
      </div>
    </div>
  );
}
