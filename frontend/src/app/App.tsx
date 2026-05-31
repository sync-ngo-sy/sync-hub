import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "@/app/router";
import { AuthProvider } from "@/lib/auth";
import { appQueryClient } from "@/lib/queryClient";

export default function App() {
  return (
    <QueryClientProvider client={appQueryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
