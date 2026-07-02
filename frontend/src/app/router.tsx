// frontend/src/app/router.tsx
import {Navigate, createHashRouter} from "react-router-dom";
import {AuthGate} from "@/app/AuthGate";
import {AppShell} from "@/app/layout/AppShell";
import {protectedRoutes, publicRoutes} from "@/app/routeRegistry";

function ProtectedShell() {
  return (
    <AuthGate>
      <AppShell/>
    </AuthGate>
  );
}

export const router = createHashRouter([
  ...publicRoutes,

  {
    path: "/",
    element: <Navigate to="/insights" replace/>,
  },

  {
    path: "/",
    element: <ProtectedShell/>,
    children: protectedRoutes,
  },
]);
