import { RouterProvider } from "react-router-dom";
import { AuthGate } from "@/app/AuthGate";
import { router } from "@/app/router";
import { AuthProvider } from "@/lib/auth";

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </AuthProvider>
  );
}
