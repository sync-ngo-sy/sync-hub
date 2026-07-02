import { useState, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { Building2, CheckCircle2, AlertCircle, LogOut } from "lucide-react";
import shieldIcon from "@/assets/shield.svg";
import passwordIcon from "@/assets/password.svg";
import companyIcon from "@/assets/company.svg";
import mailIcon from "@/assets/mail.svg";
import threadIcon from "@/assets/thread.svg";
import deleteIcon from "@/assets/delete.svg";
import visibilityOnIcon from "@/assets/visibility_on.svg";
import visibilityOffIcon from "@/assets/visibility_off.svg";
import arrowDropDownIcon from "@/assets/arrow_drop_down.svg";

export default function Settings() {
  const {
    userEmail,
    memberships,
    currentTenant,
    selectTenant,
    updatePassword,
    signOut,
    isAdmin,
  } = useAuth();

  const formRef = useRef<HTMLFormElement>(null);

  const displayEmail = userEmail || "developer@local.sync.ai";

  // Profile Header Data
  const displayName = currentTenant?.name ?? "Active Workspace";
  const displayRole = currentTenant?.role ?? "Session Member";
  const displayAvatar =
    currentTenant?.iconUrl ||
    "https://images.pexels.com/photos/37884668/pexels-photo-37884668.jpeg?_gl=1*8iun97*_ga*MTMwOTg5MjM4Mi4xNzgyNjY0ODk5*_ga_8JE65Q40S6*czE3ODI2NjQ4OTkkbzEkZzEkdDE3ODI2NjQ5MTUkajQ0JGwwJGgw";

  // Single Accordion State: tracks which section is currently expanded
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  // Password form states
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isHoveringButton, setIsHoveringButton] = useState(false);

  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Real-time Validations
  const isSubmitDisabled = useMemo(() => {
    const isEmpty = !password || !confirmPassword;
    const isTooShort = password.length < 6;
    const isMismatch = password !== confirmPassword;
    return isEmpty || isTooShort || isMismatch || passwordLoading;
  }, [password, confirmPassword, passwordLoading]);

  // Specific validation message for the expanding text
  const disabledMessage = useMemo(() => {
    if (!password) return "Please fill new password";
    if (password.length < 6) return "At least 6 characters";
    if (!confirmPassword) return "Please verify new password";
    if (password !== confirmPassword) return "Password does not match";
    return null;
  }, [password, confirmPassword]);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      setPasswordLoading(true);
      await updatePassword(password);
      setPasswordSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDivSubmit = () => {
    if (!isSubmitDisabled) {
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
    <div className="w-full py-8 px-6 lg:px-10 animate-fadeIn">
      <div className="w-full max-w-7xl mx-auto space-y-6">

        {/* Profile Header & Sign Out - Outside the container */}
        <div className="flex items-center justify-between">
          <div className="flex items-center ml-2 gap-3.5 text-left">
            <div className="flex flex-col">
              <span className="font-semibold text-[17px] text-[var(--text)] leading-tight tracking-tight group-hover:text-[var(--primary)] transition-colors">
                {displayName}
              </span>

              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[16px] font-medium text-[var(--text-muted)] opacity-85 leading-none">
                  {displayRole}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => void signOut()}
            className="h-10 mr-1 px-5 rounded-full text-[13px] font-bold uppercase tracking-wider transition-all duration-200 select-none cursor-pointer border-0 outline-none flex items-center justify-center gap-2 bg-[#2d2d2e] text-red-400 hover:bg-red-500/10"
            type="button"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>

        {/* Primary Unified Container */}
        <div className="w-full bg-[#39393a] rounded-2xl overflow-hidden">

          {/* SECTION 1: Session Credentials - Collapsible */}
          <div>
            <div className="w-full p-6 lg:p-8 flex items-center justify-between bg-transparent select-none">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                  <img src={shieldIcon} alt="" width={20} height={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text)] m-0">Session Credentials</h3>
                  <p className="text-[13px] text-[var(--text-muted)] m-0 mt-0.5">
                    Your current account and platform access role.
                  </p>
                </div>
              </div>

              <button
                className="icon-button border border-[var(--border)] transition-all duration-300 ease-out hover:bg-[#50c1b8]/20 hover:border-transparent hover:text-[#50c1b8] active:scale-95"
                onClick={() => toggleSection('credentials')}
                type="button"
              >
                <img
                  src={arrowDropDownIcon}
                  alt=""
                  className="w-6 h-6 transition-transform duration-300 ease-in-out shrink-0"
                  style={{
                    transform: expandedSection === 'credentials' ? "rotate(180deg)" : "rotate(0deg)"
                  }}
                />
              </button>
            </div>

            {/* Collapsible Content — CSS Grid technique */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{
                gridTemplateRows: expandedSection === 'credentials' ? "1fr" : "0fr",
              }}
            >
              <div className="overflow-hidden">
                <div className="p-6 lg:p-8 bg-transparent">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider font-semibold block">Account Email</span>
                      <span className="text-[15px] font-semibold text-[var(--text)] block truncate" title={displayEmail}>
                        {displayEmail}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider font-semibold block">Platform Role</span>
                      <span className="text-[15px] font-semibold text-[var(--text)] block">
                        {isAdmin ? "Global Administrator" : "Standard Platform User"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Collapsible Workspaces - ONLY renders if 2 or more workspaces exist */}
          {memberships.length > 1 && (
            <div style={{ borderTop: "1px solid var(--border)" }}>
              <div className="w-full p-6 lg:p-8 flex items-center justify-between bg-transparent select-none">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                    <img src={companyIcon} alt="" width={20} height={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text)] m-0">Workspace Selection</h3>
                    <p className="text-[13px] text-[var(--text-muted)] m-0 mt-0.5">
                      <span className="text-[var(--text-soft)] font-medium">{currentTenant?.name ?? "None Selected"}</span>
                    </p>
                  </div>
                </div>

                <button
                  className="icon-button border border-[var(--border)] transition-all duration-300 ease-out hover:bg-[#50c1b8]/20 hover:border-transparent hover:text-[#50c1b8] active:scale-95"
                  onClick={() => toggleSection('workspace')}
                  type="button"
                >
                  <img
                    src={arrowDropDownIcon}
                    alt=""
                    className="w-6 h-6 transition-transform duration-300 ease-in-out shrink-0"
                    style={{
                      transform: expandedSection === 'workspace' ? "rotate(180deg)" : "rotate(0deg)"
                    }}
                  />
                </button>
              </div>

              {/* Collapsible Content — CSS Grid technique */}
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                style={{
                  gridTemplateRows: expandedSection === 'workspace' ? "1fr" : "0fr",
                }}
              >
                <div className="overflow-hidden">
                  <div className="p-6 lg:p-8 bg-transparent space-y-4">
                    <p className="text-[13px] text-[var(--text-muted)] m-0">
                      Select your active session directory context below:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {memberships.map((membership) => {
                        const isActive = currentTenant?.id === membership.id;
                        return (
                          <button
                            key={membership.id}
                            onClick={() => selectTenant(membership.id)}
                            className={`w-full text-left p-5 rounded-2xl border-0 outline-none transition-all duration-250 flex items-center justify-between cursor-pointer group
                              ${isActive
                              ? "bg-[var(--primary)] text-[#39393a]"
                              : "bg-[#2d2d2e]/40 hover:bg-[#2d2d2e]/80 text-[var(--text)]"
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border-0 group-hover:scale-105 transition-transform
                                ${isActive
                                ? "bg-[#39393a]/10"
                                : "bg-[#2d2d2e]"
                              }`}
                              >
                                {membership.iconUrl ? (
                                  <img src={membership.iconUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Building2 size={18} className={isActive ? "text-[#39393a]/70" : "text-[var(--text-muted)]"} />
                                )}
                              </div>
                              <div>
                                <strong className={`text-[15px] font-bold block transition-colors ${isActive ? "text-[#39393a]" : "text-[var(--text)] group-hover:text-[var(--primary-hover)]"}`}>
                                  {membership.name}
                                </strong>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[13px] capitalize ${isActive ? "text-[#39393a]/85" : "text-[var(--text-muted)]"}`}>
                                    {membership.role}
                                  </span>
                                  <span className={`w-1 h-1 rounded-full opacity-50 ${isActive ? "bg-[#39393a]" : "bg-[var(--text-muted)]"}`} />
                                  <span className={`text-[13px] uppercase tracking-wider text-[10px] font-mono ${isActive ? "text-[#39393a]/85" : "text-[var(--text-muted)]"}`}>
                                    {membership.slug}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: Collapsible Password Settings */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <div className="w-full p-6 lg:p-8 flex items-center justify-between bg-transparent select-none">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                  <img src={passwordIcon} alt="" width={20} height={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text)] m-0">Password</h3>
                  <p className="text-[13px] text-[var(--text-muted)] m-0 mt-0.5">
                    Update your password
                  </p>
                </div>
              </div>

              <button
                className="icon-button border border-[var(--border)] transition-all duration-300 ease-out hover:bg-[#50c1b8]/20 hover:border-transparent hover:text-[#50c1b8] active:scale-95"
                onClick={() => toggleSection('password')}
                type="button"
              >
                <img
                  src={arrowDropDownIcon}
                  alt=""
                  className="w-7 h-7 transition-transform duration-300 ease-in-out shrink-0"
                  style={{
                    transform: expandedSection === 'password' ? "rotate(180deg)" : "rotate(0deg)"
                  }}
                />
              </button>
            </div>

            {/* Collapsible Content — CSS Grid technique */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{
                gridTemplateRows: expandedSection === 'password' ? "1fr" : "0fr",
              }}
            >
              <div className="overflow-hidden">
                <div className="p-6 lg:p-8 bg-transparent">
                  <form ref={formRef} onSubmit={handlePasswordUpdate} className="space-y-6">
                    {passwordError && (
                      <div className="p-4 rounded-xl bg-red-500/10 text-red-400 text-[13px] flex items-center gap-3">
                        <AlertCircle size={16} className="shrink-0" />
                        <span className="font-medium">{passwordError}</span>
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-4 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] text-[13px] flex items-center gap-3">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <span className="font-semibold">Password updated successfully!</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                      {/* New Password Input */}
                      <div className="space-y-2">
                        <label className="text-[13px] font-normal tracking-wide text-[var(--text-soft)] pl-1" htmlFor="password">
                          New Password
                        </label>
                        <div
                          className="search-field w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-5 pr-3 relative flex items-center gap-2.5 h-10 border-0 border-none outline-none focus:outline-none focus:ring-0 cursor-text"
                        >
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-transparent border-0 border-none outline-none focus:outline-none focus:ring-0 w-full text-[15px] text-[var(--text)] placeholder-[var(--text-muted)]/50 p-0 h-full relative"
                            placeholder="At least 6 characters"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="p-1 rounded-full hover:bg-[#2d2d2e] cursor-pointer border-0 outline-none shrink-0 flex items-center justify-center transition-colors duration-200"
                          >
                            <img
                              src={showPassword ? visibilityOnIcon : visibilityOffIcon}
                              alt="Toggle visibility"
                              width={18}
                              height={18}
                              className="opacity-70 hover:opacity-100 transition-opacity duration-200"
                            />
                          </button>
                        </div>
                      </div>

                      {/* Confirm Password Input */}
                      <div className="space-y-2">
                        <label className="text-[13px] font-normal tracking-wide text-[var(--text-soft)] pl-1" htmlFor="confirmPassword">
                          Confirm Password
                        </label>
                        <div
                          className="search-field w-full transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-5 pr-3 relative flex items-center gap-2.5 h-10 border-0 border-none outline-none focus:outline-none focus:ring-0 cursor-text"
                        >
                          <input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="bg-transparent border-0 border-none outline-none focus:outline-none focus:ring-0 w-full text-[15px] text-[var(--text)] placeholder-[var(--text-muted)]/50 p-0 h-full relative"
                            placeholder="Verify new password"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="p-1 rounded-full hover:bg-[#2d2d2e] cursor-pointer border-0 outline-none shrink-0 flex items-center justify-center transition-colors duration-200"
                          >
                            <img
                              src={showConfirmPassword ? visibilityOnIcon : visibilityOffIcon}
                              alt="Toggle visibility"
                              width={18}
                              height={18}
                              className="opacity-70 hover:opacity-100 transition-opacity duration-200"
                            />
                          </button>
                        </div>
                      </div>

                    </div>

                    <div className="flex justify-end pt-2">
                      <div
                        className="flex flex-col items-center select-none"
                        onMouseEnter={() => { if (isSubmitDisabled) setIsHoveringButton(true); }}
                        onMouseLeave={() => setIsHoveringButton(false)}
                      >
                        <div
                          role="button"
                          tabIndex={isSubmitDisabled ? -1 : 0}
                          onClick={handleDivSubmit}
                          onKeyDown={handleKeyDown}
                          className={`rounded-full px-5 shrink-0 flex items-center justify-center gap-1.5 h-10 !transform-none !scale-100 whitespace-nowrap overflow-hidden border-0 outline-none focus:outline-none focus:ring-0 transition-all duration-300 ease-in-out
                            ${isSubmitDisabled
                            ? "bg-[#2d2d2e] text-[var(--text-muted)] cursor-not-allowed opacity-60"
                            : "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer"
                          }`}
                          style={{
                            boxSizing: "border-box",
                          }}
                        >
                          <span className="text-[15px] tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
                            {passwordLoading ? "Updating.." : "Update Password"}
                          </span>
                        </div>

                        {/* Expanding Validation Message */}
                        {isSubmitDisabled && disabledMessage && (
                          <div
                            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                            style={{
                              gridTemplateRows: isHoveringButton ? "1fr" : "0fr",
                            }}
                          >
                            <div className="overflow-hidden">
                              <p className="text-[12px] text-red-400/80 font-medium pt-1.5 pb-1 text-center whitespace-nowrap">
                                {disabledMessage}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <input type="submit" className="hidden" disabled={isSubmitDisabled} />
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: Email - Disabled */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <div className="w-full p-6 lg:p-8 flex items-center justify-between bg-transparent select-none opacity-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                  <img src={mailIcon} alt="" width={20} height={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text)] m-0">Email Address</h3>
                  <p className="text-[13px] text-[var(--text-muted)] m-0 mt-0.5">
                    Update your email address
                  </p>
                </div>
              </div>

              <button
                className="icon-button border border-[var(--border)] cursor-not-allowed"
                type="button"
                disabled
              >
                <img
                  src={arrowDropDownIcon}
                  alt=""
                  className="w-6 h-6 shrink-0"
                />
              </button>
            </div>
          </div>

          {/* SECTION 5: Theme - Disabled */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <div className="w-full p-6 lg:p-8 flex items-center justify-between bg-transparent select-none opacity-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                  <img src={threadIcon} alt="" width={20} height={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text)] m-0">Theme</h3>
                  <p className="text-[13px] text-[var(--text-muted)] m-0 mt-0.5">
                    Theme, font, and other preferences
                  </p>
                </div>
              </div>

              <button
                className="icon-button border border-[var(--border)] cursor-not-allowed"
                type="button"
                disabled
              >
                <img
                  src={arrowDropDownIcon}
                  alt=""
                  className="w-6 h-6 shrink-0"
                />
              </button>
            </div>
          </div>

          {/* SECTION 6: Delete Account - Disabled */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <div className="w-full p-6 lg:p-8 flex items-center justify-between bg-transparent select-none opacity-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <img src={deleteIcon} alt="" width={20} height={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-400 m-0">Account Deletion</h3>
                  <p className="text-[13px] text-[var(--text-muted)] m-0 mt-0.5">
                    Permanently delete your account and all data
                  </p>
                </div>
              </div>

              <button
                className="icon-button border border-[var(--border)] cursor-not-allowed"
                type="button"
                disabled
              >
                <img
                  src={arrowDropDownIcon}
                  alt=""
                  className="w-6 h-6 shrink-0"
                />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
