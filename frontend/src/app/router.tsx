import { Navigate, createHashRouter } from "react-router-dom";
import { AuthGate } from "@/app/AuthGate";
import { AppShell } from "@/app/layout/AppShell";
import { protectedRoutes, publicRoutes } from "@/app/routeRegistry";

function ProtectedShell() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}

export const router = createHashRouter([
  ...publicRoutes,
  // 1. Instantly redirect root URL to the default search page before mounting the shell
  {
    path: "/",
    element: <Navigate to="/search" replace />,
  },
  // 2. Mount the app shell layout container straight onto the actual matched sub-routes
  {
    path: "/",
    element: <ProtectedShell />,
    children: protectedRoutes,
  },
]);
