import type {ReactNode} from "react";
import {SyncBrand} from "@/components/ui";

export function AuthShell({
                            eyebrow,
                            title,
                            detail,
                            aside,
                            children,
                          }: {
  eyebrow?: string;
  title: string;
  detail: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-transparent relative select-none">
      {}
      <style dangerouslySetInnerHTML={{
        __html: `

                input:-webkit-autofill,
                input:-webkit-autofill:hover,
                input:-webkit-autofill:focus,
                input:-webkit-autofill:active {
                    -webkit-text-fill-color: var(--text) !important;
                    -webkit-box-shadow: 0 0 0px 1000px #2d2d2e00 inset !important;
                    transition: background-color 5000s ease-in-out 0s;
                    background-color: transparent !important;
                }
                input:-moz-autofill {
                    filter: none !important;
                }
            `
      }}/>

      {}
      <header
        className="topbar fixed top-0 left-0 right-0 flex items-center justify-between px-8 h-24 shrink-0 z-50 bg-[#323233]/85 backdrop-blur-md select-none">
        <div className="topbar__title">
          <div className="flex items-center gap-3">
            <span
              className="text-[13px] font-bold tracking-wider text-[var(--text)] uppercase font-sans whitespace-nowrap">
              Sync Hub <span className="text-[var(--text-soft)] font-normal">— Employer Access</span>
            </span>
          </div>
        </div>

        {}
        <div className="topbar__actions flex items-center gap-4" dir="rtl">
          <div className="scale-50 origin-right flex items-center">
            <SyncBrand subtitle=""/>
          </div>
        </div>
      </header>

      {}
      <main className="flex-1 w-full pt-20 flex flex-col items-center justify-start overflow-y-auto select-none">
        {}
        <div
          className="w-full max-w-5xl min-h-[calc(100vh-80px)] flex flex-col justify-around items-center text-center py-10 px-6 md:px-16 gap-12 select-none">

          {}
          <div className="space-y-3 flex flex-col items-center select-none">
            {eyebrow ? (
              <span
                className="inline-flex px-3.5 py-1 text-[11px] font-bold tracking-wider uppercase rounded-full bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--border)] select-none">
                                {eyebrow}
                            </span>
            ) : null}
            <h1 className="text-[24px] md:text-[32px] font-bold text-[var(--text)] leading-tight tracking-tight m-0 max-w-2xl select-none transition-all duration-300">
              {title}
            </h1>
            <p className="text-[14px] md:text-[15.5px] text-[var(--text-muted)] leading-relaxed max-w-2xl m-0 select-none transition-all duration-300">
              {detail}
            </p>
          </div>

          {}
          <div className="w-full border-t border-[var(--border)] pt-8 flex flex-col items-center select-none">
            <div className="w-full max-w-xl text-left select-none">
              {children}
            </div>
          </div>

          {}
          {aside ? (
            <div className="w-full border-t border-[var(--border)] pt-8 select-none">
              {aside}
            </div>
          ) : null}

        </div>
      </main>
    </div>
  );
}
