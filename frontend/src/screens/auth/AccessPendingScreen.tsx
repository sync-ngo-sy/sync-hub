import {ShieldCheck, Search} from "lucide-react";
import {useAuth} from "@/lib/auth";
import {AuthShell} from "./AuthShell";

export function AccessPendingScreen() {
  const { signOut, userEmail } = useAuth();

  return (
    <AuthShell
      title="Your account is not active yet."
      detail="You are signed in, but this email has not been added to the shared CV platform directory."
      aside={
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full select-none">
          <div
            className="flex flex-col items-center text-center p-6 border border-[var(--border)] rounded-2xl bg-[#1e1e1f] transition-all duration-300 hover:bg-[#242425] hover:border-[var(--primary)]/30 select-none">
            <ShieldCheck className="text-[var(--primary)] mb-3" size={24}/>
            <strong className="block text-[var(--text)] text-[14px] font-bold">Ask your admin</strong>
            <p className="text-[12px] text-[var(--text-muted)] m-0 mt-1.5 leading-relaxed">Request access
              for this email before continuing.</p>
          </div>
          <div
            className="flex flex-col items-center text-center p-6 border border-[var(--border)] rounded-2xl bg-[#1e1e1f] transition-all duration-300 hover:bg-[#242425] hover:border-[var(--primary)]/30 select-none">
            <Search className="text-[var(--primary)] mb-3" size={24}/>
            <strong className="block text-[var(--text)] text-[14px] font-bold">Shared CV pool</strong>
            <p className="text-[12px] text-[var(--text-muted)] m-0 mt-1.5 leading-relaxed">Approved accounts
              can search the same indexed candidate database.</p>
          </div>
        </div>
      }
    >
      <div className="space-y-6 select-none">
        <div className="text-center">
          <p className="text-[14px] text-[var(--text-muted)] m-0 select-none">
            Signed in as <span
            className="text-[var(--primary)] font-semibold">{userEmail ?? "unknown user"}</span>
          </p>
        </div>

        <div
          className="status-banner py-5 px-6 rounded-xl border border-red-500/20 bg-red-500/5 text-red-200 text-[14px] leading-relaxed flex items-center justify-center text-center w-full select-none">
          Please contact your platform admin to approve access permission levels for this workspace email
          account.
        </div>

        <div className="w-full select-none">
          <div
            role="button"
            tabIndex={0}
            onClick={() => void signOut()}
            className="rounded-xl px-5 shrink-0 flex items-center justify-center gap-1.5 h-12 w-full !transform-none !scale-100 whitespace-nowrap overflow-hidden border-0 outline-none focus:outline-none focus:ring-0 transition-all duration-300 ease-in-out select-none bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer shadow-xl shadow-[var(--primary)]/10"
            style={{
              boxSizing: "border-box",
            }}
          >
            <span className="text-[16px] tracking-wide shrink-0 whitespace-nowrap leading-none font-normal select-none">
              Sign out and switch accounts
            </span>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
