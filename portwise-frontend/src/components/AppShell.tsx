import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import { isDemoMode } from "@/lib/demo-mode";
import { Wordmark } from "./Brand";

export function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only-focusable fixed left-4 top-4 z-50 rounded-md bg-white px-4 py-2 font-semibold text-pw-navy shadow-[var(--shadow-pop)]"
      >
        Skip to calculator
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const demo = isDemoMode();
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors sm:px-3",
      isActive ? "text-white" : "text-pw-on-navy hover:text-white",
    );
  return (
    <header data-site-header className="bg-pw-navy">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="rounded-md" aria-label="PortWise home">
          <Wordmark inverted />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {demo && (
            <span
              className="mr-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-pw-amber px-2.5 py-1 text-xs font-semibold text-pw-navy"
              title="Numbers come from sample tariffs and rates, not the live API."
            >
              <FlaskConical className="size-3.5" aria-hidden="true" />
              Demo<span className="hidden sm:inline"> data</span>
            </span>
          )}
          <NavLink to="/" end className={(s) => cn(link(s), "max-sm:hidden")}>
            Calculator
          </NavLink>
          <NavLink to="/how-it-works" className={link}>
            How it works
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer data-site-footer className="mt-16 border-t border-pw-border bg-white">
      <div className="mx-auto grid max-w-[1120px] gap-6 px-4 py-10 text-sm text-pw-muted sm:px-6 md:grid-cols-[1.4fr_1fr] lg:px-8">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-[56ch] leading-6">
            Estimates are for planning only. Final charges are assessed by the Nigeria Customs Service at clearing.
          </p>
        </div>
        <div className="md:text-right">
          <p>
            <Link to="/how-it-works" className="font-medium text-pw-blue hover:underline">
              How the estimate is calculated
            </Link>
          </p>
          <p className="mt-2">Built for Devcenter Hacktober 2026. Hosted on Rumpty Cloud.</p>
          <p className="mt-2">
            <Link to="/admin" className="hover:text-pw-navy hover:underline">
              Admin sign-in
            </Link>
          </p>
          {isDemoMode() && <p className="mt-2 text-pw-amber-text">Demo mode: sample tariffs and rates.</p>}
        </div>
      </div>
    </footer>
  );
}
