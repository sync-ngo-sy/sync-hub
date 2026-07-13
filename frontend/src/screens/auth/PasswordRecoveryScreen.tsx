import {useState, useMemo, useRef} from "react";
import {Loader2, ShieldCheck, Star} from "lucide-react";
import {useAuth} from "@/lib/auth";
import {AuthShell} from "./AuthShell";

import passwordIcon from "@/assets/password.svg";
import visibilityOnIcon from "@/assets/visibility_on.svg";
import visibilityOffIcon from "@/assets/visibility_off.svg";

export function PasswordRecoveryScreen() {
  const {updatePassword, signOut} = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  const [passTouched, setPassTouched] = useState(false);
  const [confTouched, setConfTouched] = useState(false);

  const isPassEmpty = !password;
  const isPassTooShort = !isPassEmpty && password.length < 8;
  const isConfEmpty = !confirmPassword;
  const isMismatch = !isConfEmpty && password !== confirmPassword;

  const passError = useMemo(() => {
    if (!passTouched) return null;
    if (isPassEmpty) return "New password is required";
    if (isPassTooShort) return "Password must be at least 8 characters long";
    return null;
  }, [password, passTouched, isPassEmpty, isPassTooShort]);

  const confError = useMemo(() => {
    if (!confTouched) return null;
    if (isConfEmpty) return "Please verify your new password";
    if (isMismatch) return "Passwords do not match";
    return null;
  }, [confirmPassword, confTouched, isConfEmpty, isMismatch, password]);

  const isSubmitDisabled = useMemo(() => {
    return isPassEmpty || isPassTooShort || isConfEmpty || isMismatch;
  }, [isPassEmpty, isPassTooShort, isConfEmpty, isMismatch]);

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
      title="Set a new password."
      detail="Create a secure new password to continue to the talent platform."
      aside={
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full select-none">
          <div
            className="flex flex-col items-center text-center p-6 border border-[var(--border)] rounded-2xl bg-[#1e1e1f] transition-all duration-300 hover:bg-[#242425] hover:border-[var(--primary)]/30 select-none">
            <ShieldCheck className="text-[var(--primary)] mb-3" size={24}/>
            <strong className="block text-[var(--text)] text-[14px] font-bold">Secure account</strong>
            <p className="text-[12px] text-[var(--text-muted)] m-0 mt-1.5 leading-relaxed">Your new password
              protects your candidate search and shortlist access.</p>
          </div>
          <div
            className="flex flex-col items-center text-center p-6 border border-[var(--border)] rounded-2xl bg-[#1e1e1f] transition-all duration-300 hover:bg-[#242425] hover:border-[var(--primary)]/30 select-none">
            <Star className="text-[var(--primary)] mb-3" size={24}/>
            <strong className="block text-[var(--text)] text-[14px] font-bold">Back to hiring</strong>
            <p className="text-[12px] text-[var(--text-muted)] m-0 mt-1.5 leading-relaxed">After saving it,
              we will take you back into the platform.</p>
          </div>
        </div>
      }
    >
      <form ref={formRef} className="space-y-6 select-none" onSubmit={async (e) => {
        e.preventDefault();
        if (!isSubmitDisabled && !isSubmitting) {
          setIsSubmitting(true);
          try {
            await updatePassword(password);
          } catch (error) {
            console.error("Failed to update password:", error);
          } finally {
            setIsSubmitting(false);
          }
        }
      }}>
        <div className="space-y-4 select-none">
          <div className="flex flex-col">
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
                onBlur={() => setPassTouched(true)}
                placeholder="Password"
                className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 flex-1 text-[17px] text-[var(--text)] placeholder:text-[var(--text-soft)] placeholder:opacity-30 h-full p-0 select-text"
                required
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
                gridTemplateRows: passError ? "minmax(0, 1fr)" : "minmax(0, 0fr)",
                opacity: passError ? 1 : 0,
                marginTop: passError ? "0.35rem" : "0rem"
              }}
            >
              <div className="overflow-hidden">
                                <span className="text-[12px] font-medium text-red-400 pl-2 pt-1 select-none">
                                    {passError}
                                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
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
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onBlur={() => setConfTouched(true)}
                placeholder="Password Confirmation"
                className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 flex-1 text-[17px] text-[var(--text)] placeholder:text-[var(--text-soft)] placeholder:opacity-30 h-full p-0 select-text"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="bg-transparent border-0 p-0 opacity-60 hover:opacity-100 transition-opacity duration-300 shrink-0 focus:outline-none select-none cursor-pointer"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                <img
                  src={showConfirmPassword ? visibilityOnIcon : visibilityOffIcon}
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
                gridTemplateRows: confError ? "minmax(0, 1fr)" : "minmax(0, 0fr)",
                opacity: confError ? 1 : 0,
                marginTop: confError ? "0.35rem" : "0rem"
              }}
            >
              <div className="overflow-hidden">
                                <span className="text-[12px] font-medium text-red-400 pl-2 pt-1 select-none">
                                    {confError}
                                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2 flex flex-col items-center gap-4 select-none">
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
                  Save password
                </span>
              )}
            </div>
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
              <span
                className="text-[16px] tracking-wide shrink-0 whitespace-nowrap leading-none font-normal select-none">
                Use another account
              </span>
            </div>
          </div>
        </div>

        <input type="submit" className="hidden" disabled={isSubmitDisabled || isSubmitting}/>
      </form>
    </AuthShell>
  );
}
