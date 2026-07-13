// frontend/src/app/AuthGate.tsx
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

import { SignInScreen } from "@/screens/auth/SignInScreen";
import { PasswordRecoveryScreen } from "@/screens/auth/PasswordRecoveryScreen";
import { AccessPendingScreen } from "@/screens/auth/AccessPendingScreen";
import { LoadingScreen } from "@/screens/auth/LoadingScreen";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const { enabled, isAdmin, loading, memberships, passwordRecovery, session } = useAuth();

  if (!enabled) {
    return <>{children}</>;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  if (passwordRecovery) {
    return <PasswordRecoveryScreen />;
  }

  if (!memberships.length && !isAdmin) {
    return <AccessPendingScreen />;
  }

  return <>{children}</>;
}
