import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Search, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth/authContextStore'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

const resetRequestSchema = z.object({
  email: z.email('Enter a valid email address.'),
})

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmation: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'Passwords do not match.',
  })

type SignInValues = z.infer<typeof signInSchema>
type ResetRequestValues = z.infer<typeof resetRequestSchema>
type PasswordValues = z.infer<typeof passwordSchema>

interface AuthShellProps {
  title: string
  detail: string
  children: React.ReactNode
  aside?: React.ReactNode
}

function AuthShell({ title, detail, children, aside }: AuthShellProps) {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-5 lg:px-10">
        <span className="caption-label">SYNC Hub — Employer access</span>
        <a href="/careers" className="flex items-center gap-3" aria-label="SYNC careers">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
            S
          </span>
          <span className="text-xl font-medium tracking-[-0.03em]">SYNC</span>
        </a>
      </header>

      <section className="flex flex-1 flex-col items-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-5xl text-center">
          <h1 className="text-3xl font-medium tracking-[-0.045em] text-foreground">{title}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">{detail}</p>
        </div>

        <div className="mt-20 w-full max-w-xl">{children}</div>
        {aside ? <div className="mt-auto w-full max-w-4xl pt-16">{aside}</div> : null}
      </section>
    </main>
  )
}

function FormError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}

function PasswordInput({
  id,
  label,
  registration,
}: {
  id: string
  label: string
  registration: ReturnType<ReturnType<typeof useForm<PasswordValues>>['register']>
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} type={visible ? 'text' : 'password'} className="px-9" {...registration} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </div>
  )
}

export function SignInScreen() {
  const { session, passwordRecovery, signIn, requestPasswordReset } = useAuth()
  const [mode, setMode] = useState<'sign-in' | 'reset'>('sign-in')
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const signInForm = useForm<SignInValues>({ resolver: zodResolver(signInSchema) })
  const resetForm = useForm<ResetRequestValues>({ resolver: zodResolver(resetRequestSchema) })

  if (passwordRecovery) {
    return <PasswordRecoveryScreen />
  }
  if (session) {
    return <Navigate to="/candidates" replace />
  }

  const submitSignIn = signInForm.handleSubmit(async (values) => {
    setSubmissionError(null)
    try {
      await signIn(values.email, values.password)
    } catch (error) {
      setSubmissionError(getUserErrorMessage(error))
    }
  })

  const submitReset = resetForm.handleSubmit(async (values) => {
    setSubmissionError(null)
    try {
      await requestPasswordReset(values.email)
      setSubmissionMessage('Check your inbox for a secure password reset link.')
    } catch (error) {
      setSubmissionError(getUserErrorMessage(error))
    }
  })

  return (
    <AuthShell
      title="Welcome back."
      detail="Sign in to search your shared candidate pool, compare profiles, and manage hiring work."
      aside={
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex gap-3 p-5 text-left">
              <ShieldCheck className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-medium">Approved access</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only invited employer accounts can enter the platform.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex gap-3 p-5 text-left">
              <Search className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-medium">AI-powered search</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Find profiles by role, skills, experience, location, or company.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex gap-3 p-5 text-left">
              <ShieldCheck className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-medium">Your shortlist</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Save candidates to your account and return when you are ready.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      {submissionError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{submissionError}</AlertDescription>
        </Alert>
      ) : null}
      {submissionMessage ? (
        <Alert className="mb-5">
          <AlertTitle>Reset link sent</AlertTitle>
          <AlertDescription>{submissionMessage}</AlertDescription>
        </Alert>
      ) : null}

      {mode === 'sign-in' ? (
        <form className="space-y-5" onSubmit={(event) => void submitSignIn(event)}>
          <div className="space-y-2">
            <Label htmlFor="sign-in-email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="sign-in-email"
                type="email"
                autoComplete="email"
                className="pl-9"
                {...signInForm.register('email')}
              />
            </div>
            <FormError message={signInForm.formState.errors.email?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sign-in-password">Password</Label>
            <Input
              id="sign-in-password"
              type="password"
              autoComplete="current-password"
              {...signInForm.register('password')}
            />
            <FormError message={signInForm.formState.errors.password?.message} />
          </div>
          <Button className="w-full" type="submit" disabled={signInForm.formState.isSubmitting}>
            {signInForm.formState.isSubmitting ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : null}
            Sign in
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={(event) => void submitReset(event)}>
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              {...resetForm.register('email')}
            />
            <FormError message={resetForm.formState.errors.email?.message} />
          </div>
          <Button className="w-full" type="submit" disabled={resetForm.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}

      <Button
        type="button"
        variant="link"
        className="mt-4 w-full"
        onClick={() => {
          setMode((value) => (value === 'sign-in' ? 'reset' : 'sign-in'))
          setSubmissionError(null)
          setSubmissionMessage(null)
        }}
      >
        {mode === 'sign-in' ? 'Forgot your password?' : 'Back to sign in'}
      </Button>
    </AuthShell>
  )
}

export function PasswordRecoveryScreen() {
  const { updatePassword, signOut } = useAuth()
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const form = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) })

  const submit = form.handleSubmit(async (values) => {
    setSubmissionError(null)
    try {
      await updatePassword(values.password)
    } catch (error) {
      setSubmissionError(getUserErrorMessage(error))
    }
  })

  return (
    <AuthShell
      title="Set a new password."
      detail="Create a secure new password to continue to the talent platform."
    >
      {submissionError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle>Password update failed</AlertTitle>
          <AlertDescription>{submissionError}</AlertDescription>
        </Alert>
      ) : null}
      <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        <PasswordInput
          id="new-password"
          label="New password"
          registration={form.register('password')}
        />
        <FormError message={form.formState.errors.password?.message} />
        <PasswordInput
          id="confirm-password"
          label="Confirm password"
          registration={form.register('confirmation')}
        />
        <FormError message={form.formState.errors.confirmation?.message} />
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          Save password
        </Button>
        <Button className="w-full" type="button" variant="outline" onClick={() => void signOut()}>
          Use another account
        </Button>
      </form>
    </AuthShell>
  )
}

export function AccessPendingScreen() {
  const { user, signOut } = useAuth()
  return (
    <AuthShell
      title="Your account is not active yet."
      detail="You are signed in, but this email has not been added to a workspace."
    >
      <div className="space-y-5 text-center">
        <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{user?.email ?? 'this account'}</span>. Ask
          your platform admin to approve workspace access.
        </p>
        <Button className="w-full" type="button" onClick={() => void signOut()}>
          Sign out and switch accounts
        </Button>
      </div>
    </AuthShell>
  )
}

export function LoadingScreen() {
  return (
    <main
      className="flex min-h-svh items-center justify-center"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        Authentication…
      </div>
    </main>
  )
}

export function NotConfiguredScreen() {
  return (
    <AuthShell
      title="App not configured"
      detail="This development build is missing its required Supabase configuration."
    >
      <Alert>
        <AlertTitle>Configuration required</AlertTitle>
        <AlertDescription>
          Add the required VITE variables to the repository-root .env file, then restart the
          development server.
        </AlertDescription>
      </Alert>
    </AuthShell>
  )
}
