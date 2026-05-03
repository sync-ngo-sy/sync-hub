import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Building2, Loader2, LogOut, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Panel, SyncBrand, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";

type AuthGateProps = {
  children: ReactNode;
};

function AuthShell({
  eyebrow,
  title,
  detail,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <div className="auth-layout">
        <Panel className="auth-panel auth-panel--hero">
          <SyncBrand />

          <div className="stack">
            <Tag tone="primary">{eyebrow}</Tag>
            <h1>{title}</h1>
            <p>{detail}</p>
          </div>

          <div className="auth-grid">{aside}</div>
        </Panel>

        <Panel className="auth-panel">{children}</Panel>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <AuthShell
      eyebrow="Bootstrapping"
      title="Preparing the live workspace."
      detail="Checking your Supabase session, tenant memberships, and local environment before loading the recruiter console."
      aside={
        <>
          <div className="auth-feature">
            <ShieldCheck size={18} />
            <div>
              <strong>RLS-aware</strong>
              <p>Every read stays tenant-scoped once the session is active.</p>
            </div>
          </div>
          <div className="auth-feature">
            <Sparkles size={18} />
            <div>
              <strong>Retrieval-first</strong>
              <p>Search, compare, and ask run against stored candidate evidence.</p>
            </div>
          </div>
        </>
      }
    >
      <div className="auth-loading">
        <Loader2 className="spin" size={20} />
        <span>Loading session context...</span>
      </div>
    </AuthShell>
  );
}

function SignInScreen() {
  const { authError, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      if (mode === "sign-in") {
        await signIn(email, password);
      } else {
        const nextMessage = await signUp(email, password);
        setMessage(nextMessage);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Live mode"
      title={mode === "sign-in" ? "Sign in to the live workspace." : "Create a local test account."}
      detail="Once authenticated, the frontend uses your Supabase session for Edge Functions and RLS-protected dossier reads instead of mock data."
      aside={
        <>
          <div className="auth-feature">
            <Mail size={18} />
            <div>
              <strong>Email + password</strong>
              <p>Use local Supabase Auth for end-to-end testing without a custom backend.</p>
            </div>
          </div>
          <div className="auth-feature">
            <ShieldCheck size={18} />
            <div>
              <strong>JWT verified functions</strong>
              <p>`/search`, `/compare`, and `/ask` receive the same signed-in context as the database.</p>
            </div>
          </div>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="stack">
          <h2>{mode === "sign-in" ? "Sign In" : "Create Account"}</h2>
          <p>Use the browser anon key, then let Postgres and Edge Functions enforce tenant access.</p>
        </div>

        <label className="panel__section">
          <span>Email</span>
          <input className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="recruiter@example.com" required />
        </label>

        <label className="panel__section">
          <span>Password</span>
          <input className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength={6} required />
        </label>

        {message || authError ? <div className="status-banner">{message ?? authError}</div> : null}

        <button className="button button--primary button--full" type="submit" disabled={pending}>
          {pending ? <Loader2 className="spin" size={16} /> : null}
          {mode === "sign-in" ? "Sign In" : "Create Account"}
        </button>

        <button
          className="button button--secondary button--full"
          type="button"
          onClick={() => {
            setMode((value) => (value === "sign-in" ? "sign-up" : "sign-in"));
            setMessage(null);
          }}
        >
          {mode === "sign-in" ? "Need a local account?" : "Already have an account?"}
          <strong>{mode === "sign-in" ? "Create one" : "Sign in instead"}</strong>
        </button>
      </form>
    </AuthShell>
  );
}

function TenantSetupScreen() {
  const { authError, bootstrapTenant, signOut, userEmail } = useAuth();
  const [name, setName] = useState("CV Intelligence Demo");
  const [slug, setSlug] = useState("cv-intelligence-demo");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const suggestedSlug = useMemo(
    () =>
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/g, "")
        .replace(/-+$/g, "")
        .slice(0, 48),
    [name],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      await bootstrapTenant(name, slug || suggestedSlug);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Tenant bootstrap"
      title="Create the first workspace."
      detail="RLS is active, so a fresh local user still needs an organization and membership before search and dossier screens can read anything."
      aside={
        <>
          <div className="auth-feature">
            <Building2 size={18} />
            <div>
              <strong>Self-serve bootstrap</strong>
              <p>The initial tenant is created through a guarded SQL RPC, not manual SQL edits.</p>
            </div>
          </div>
          <div className="auth-feature">
            <ShieldCheck size={18} />
            <div>
              <strong>Owner membership</strong>
              <p>Your first tenant membership is inserted as `owner` so admin screens work immediately.</p>
            </div>
          </div>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="stack">
          <h2>Initialize tenant context</h2>
          <p>Signed in as {userEmail ?? "unknown user"}.</p>
        </div>

        <label className="panel__section">
          <span>Workspace name</span>
          <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Talent" required />
        </label>

        <label className="panel__section">
          <span>Workspace slug</span>
          <input className="form-input" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={suggestedSlug || "acme-talent"} />
        </label>

        {message || authError ? <div className="status-banner">{message ?? authError}</div> : null}

        <button className="button button--primary button--full" type="submit" disabled={pending}>
          {pending ? <Loader2 className="spin" size={16} /> : null}
          Create Workspace
        </button>

        <button className="button button--secondary button--full" type="button" onClick={() => void signOut()}>
          <LogOut size={16} />
          Sign Out
        </button>
      </form>
    </AuthShell>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const { enabled, isAdmin, loading, memberships, session } = useAuth();

  if (!enabled) {
    return <>{children}</>;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  if (!memberships.length && !isAdmin) {
    return <TenantSetupScreen />;
  }

  return <>{children}</>;
}
