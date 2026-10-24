import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary, NotFoundPage } from "@/components/StatusPages";
import { CalculatorPage } from "@/features/calculator/CalculatorPage";

const AdminApp = lazy(() => import("@/features/admin/AdminApp"));

const MethodologyPage = lazy(() =>
  import("@/features/methodology/MethodologyPage").then((m) => ({ default: m.MethodologyPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/admin/*"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-dvh bg-pw-bg" />}>
                  <AdminApp />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route element={<AppShell />}>
            <Route
              path="/"
              element={
                <ErrorBoundary>
                  <CalculatorPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="/how-it-works"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<div className="h-[60vh]" />}>
                    <MethodologyPage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
