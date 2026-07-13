// frontend/src/screens/auth/SignInScreen.tsx
import {useState, useMemo, useRef} from "react";
import {Loader2, Search, ShieldCheck, Star} from "lucide-react";
import {useAuth} from "@/lib/auth";
import {AuthShell} from "./AuthShell";

import mailIcon from "@/assets/mail.svg";
import passwordIcon from "@/assets/password.svg";
import visibilityOnIcon from "@/assets/visibility_on.svg";
import visibilityOffIcon from "@/assets/visibility_off.svg";

const isValidEmail = (emailStr: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr.trim());
};

export function SignInScreen() {
  const {signIn, requestPasswordReset, authError} = useAuth();
  const [mode, setMode] = useState<"sign-in" | "reset-password">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const isEmailEmpty = !email.trim();
  const isEmailInvalid = !isEmailEmpty && !isValidEmail(email);
  const isPasswordEmpty = !password;
  const isPasswordTooShort = !isPasswordEmpty && password.length < 8;

  const emailError = useMemo(() => {
    if (!emailTouched) return null;
    if (isEmailEmpty) return "Corporate email address is required";
    if (isEmailInvalid) return "Please enter a valid corporate email address";
    return null;
  }, [email, emailTouched, isEmailEmpty, isEmailInvalid]);

  const passwordError = useMemo(() => {
    if (mode !== "sign-in" || !passwordTouched) return null;
    if (isPasswordEmpty) return "Password is required";
    if (isPasswordTooShort) return "Password must be at least 8 characters long";
    return null;
  }, [password, passwordTouched, isPasswordEmpty, isPasswordTooShort, mode]);

  const isSubmitDisabled = useMemo(() => {
    if (mode === "sign-in") {
      return isEmailEmpty || isEmailInvalid || isPasswordEmpty || isPasswordTooShort;
    }
    return isEmailEmpty || isEmailInvalid;
  }, [email, password, mode, isEmailEmpty, isEmailInvalid, isPasswordEmpty, isPasswordTooShort]);

  const handleDivSubmit = () => {
    if (!isSubmitDisabled && !isSubmitting) {
      formRef.current?.requestSubmit();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleDivSubmit();
    }
  };

  return (
    <AuthShell
      title={mode === "sign-in" ? "Sign in to the talent platform." : "Reset your password."}
      detail={
        mode === "sign-in"
          ? "Search the shared CV pool, review candidate profiles, and manage your shortlist."
          : "Enter your approved email and we will send a reset link."
      }
      aside={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full select-none">
          <div
            className="flex flex-col items-center text-center p-6 border border-[var(--border)] rounded-2xl bg-[#1e1e1f] transition-all duration-300 hover:bg-[#242425] hover:border-[var(--primary)]/30 select-none">
            <ShieldCheck className="text-[var(--primary)] mb-3" size={24}/>
            <strong className="block text-[var(--text)] text-[14px] font-bold">Approved access</strong>
            <p className="text-[12px] text-[var(--text-muted)] m-0 mt-1.5 leading-relaxed">Only invited
              employer accounts can enter the platform.</p>
          </div>
          <div
            className="flex flex-col items-center text-center p-6 border border-[var(--border)] rounded-2xl bg-[#1e1e1f] transition-all duration-300 hover:bg-[#242425] hover:border-[var(--primary)]/30 select-none">
            <Search className="text-[var(--primary)] mb-3" size={24}/>
            <strong className="block text-[var(--text)] text-[14px] font-bold">AI-powered search</strong>
            <p className="text-[12px] text-[var(--text-muted)] m-0 mt-1.5 leading-relaxed">Find profiles by
              role, skills, experience, location, or company.</p>
          </div>
          <div
            className="flex flex-col items-center text-center p-6 border border-[var(--border)] rounded-2xl bg-[#1e1e1f] transition-all duration-300 hover:bg-[#242425] hover:border-[var(--primary)]/30 select-none">
            <Star className="text-[var(--primary)] mb-3" size={24}/>
            <strong className="block text-[var(--text)] text-[14px] font-bold">Your shortlist</strong>
            <p className="text-[12px] text-[var(--text-muted)] m-0 mt-1.5 leading-relaxed">Save candidates
              to your account and export them when you are ready.</p>
          </div>
        </div>
      }
    >
      <form ref={formRef} className="space-y-6 select-none" onSubmit={async (e) => {
        e.preventDefault();
        if (!isSubmitDisabled && !isSubmitting) {
          setIsSubmitting(true);
          setMessage(null);
          try {
            if (mode === "sign-in") {
              await signIn(email, password);
            } else {
              await requestPasswordReset(email);
              setMessage("If this email has access, we sent a secure password reset link.");
            }
          } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
          } finally {
            setIsSubmitting(false);
          }
        }
      }}>

        <div className="flex flex-col select-none">

          {/* Email Field */}
          <div className="flex flex-col">
            <label
              className="search-field group w-full border border-[var(--border)] focus-within:border-[var(--primary)] transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 rounded-xl pl-4 pr-4 relative flex items-center gap-4 h-14 outline-none focus:outline-none focus:ring-0 cursor-text select-none z-10">
              <img
                src={mailIcon}
                alt=""
                width={22}
                height={22}
                className="opacity-60 group-focus-within:opacity-100 transition-opacity duration-300 shrink-0 select-none"
                style={{display: "block"}}
              />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="Corporate Email Address"
                className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 flex-1 text-[17px] text-[var(--text)] placeholder:text-[var(--text-soft)] placeholder:opacity-30 h-full p-0 select-text"
                required
              />
            </label>

            <div
              className="grid transition-[grid-template-rows,opacity,margin-top] duration-200 ease-in-out"
              style={{
                gridTemplateRows: emailError ? "minmax(0, 1fr)" : "minmax(0, 0fr)",
                opacity: emailError ? 1 : 0,
                marginTop: emailError ? "0.35rem" : "0rem"
              }}
            >
              <div className="overflow-hidden">
                                <span className="text-[12px] font-medium text-red-400 pl-2 pt-1 select-none">
                                    {emailError}
                                </span>
              </div>
            </div>
          </div>

          {/* Password Field */}
          <div
            className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
            style={{
              gridTemplateRows: mode === "sign-in" ? "minmax(0, 1fr)" : "minmax(0, 0fr)",
              opacity: mode === "sign-in" ? 1 : 0
            }}
          >
            <div className="overflow-hidden flex flex-col pt-6">
              <label
                className="search-field group w-full border border-[var(--border)] focus-within:border-[var(--primary)] transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 rounded-xl pl-4 pr-4 relative flex items-center gap-4 h-14 outline-none focus:outline-none focus:ring-0 cursor-text select-none">
                <img
                  src={passwordIcon}
                  alt=""
                  width={22}
                  height={22}
                  className="opacity-60 group-focus-within:opacity-100 transition-opacity duration-300 shrink-0 select-none"
                  style={{display: "block"}}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => setPasswordTouched(true)}
                  placeholder="Password"
                  className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 flex-1 text-[17px] text-[var(--text)] placeholder:text-[var(--text-soft)] placeholder:opacity-30 h-full p-0 select-text"
                  required={mode === "sign-in"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="bg-transparent border-0 p-0 opacity-60 hover:opacity-100 transition-opacity duration-300 shrink-0 focus:outline-none select-none cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <img
                    src={showPassword ? visibilityOnIcon : visibilityOffIcon}
                    alt=""
                    width={22}
                    height={22}
                    className="block"
                    style={{display: "block"}}
                  />
                </button>
              </label>

              <div
                className="grid transition-[grid-template-rows,opacity,margin-top] duration-200 ease-in-out"
                style={{
                  gridTemplateRows: passwordError ? "minmax(0, 1fr)" : "minmax(0, 0fr)",
                  opacity: passwordError ? 1 : 0,
                  marginTop: passwordError ? "0.35rem" : "0rem"
                }}
              >
                <div className="overflow-hidden">
                                    <span className="text-[12px] font-medium text-red-400 pl-2 pt-1 select-none">
                                        {passwordError}
                                    </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* API Status / Error Message Banner - Smooth Expand & Centered */}
        <div
          className="grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-in-out"
          style={{
            gridTemplateRows: message || authError ? "minmax(0, 1fr)" : "minmax(0, 0fr)",
            opacity: message || authError ? 1 : 0,
            marginTop: message || authError ? "0.5rem" : "0rem"
          }}
        >
          <div className="overflow-hidden">
            <div className={`w-full p-4 rounded-xl border text-[13px] leading-relaxed flex items-center justify-center text-center select-none ${
              message?.includes("sent a secure password")
                ? "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-red-500/20 bg-red-500/5 text-red-200"
            }`}>
              <span>{message ?? authError}</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex flex-col items-center gap-4 select-none">

          {/* Submit Button */}
          <div className="w-full select-none">
            <div
              role="button"
              tabIndex={isSubmitDisabled || isSubmitting ? -1 : 0}
              onClick={handleDivSubmit}
              onKeyDown={handleKeyDown}
              className={`rounded-xl px-5 shrink-0 flex items-center justify-center gap-1.5 h-12 w-full !transform-none !scale-100 whitespace-nowrap overflow-hidden border-0 outline-none focus:outline-none focus:ring-0 transition-all duration-300 ease-in-out select-none
                              ${(isSubmitDisabled || isSubmitting)
                ? "bg-[#2d2d2e] text-[var(--text-muted)] cursor-not-allowed opacity-60"
                : "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer shadow-xl shadow-[var(--primary)]/10"
              }`}
              style={{
                boxSizing: "border-box",
              }}
            >
              {isSubmitting ? (
                <Loader2 className="spin" size={20}/>
              ) : (
                <span
                  className="text-[16px] tracking-wide shrink-0 whitespace-nowrap leading-none font-normal select-none">
                  {mode === "sign-in" ? "Sign In" : "Send reset link"}
                </span>
              )}
            </div>
          </div>

          {/* Mode Toggle Button */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setMode((value) => (value === "sign-in" ? "reset-password" : "sign-in"));
              setPassword("");
              setEmailTouched(false);
              setPasswordTouched(false);
              setMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setMode((value) => (value === "sign-in" ? "reset-password" : "sign-in"));
                setPassword("");
                setEmailTouched(false);
                setPasswordTouched(false);
                setMessage(null);
              }
            }}
            className="inline-flex items-center justify-center text-[13.5px] text-[var(--text-soft)] hover:text-[var(--primary)] transition-colors duration-300 select-none cursor-pointer outline-none pb-4 mb-4"
          >
                        <span className="font-semibold select-none">
                            {mode === "sign-in" ? "Forgot Password?" : "Back to Login"}
                        </span>
          </div>
        </div>

        <input type="submit" className="hidden" disabled={isSubmitDisabled || isSubmitting}/>
      </form>
    </AuthShell>
  );
}
