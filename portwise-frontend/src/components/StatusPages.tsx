import { Component, type ReactNode } from "react";
import { Link } from "react-router";
import { usePageTitle } from "./usePageTitle";

function Frame({ title, body, code }: { title: string; body: string; code?: string }) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6 lg:px-8">
      {/* Empty container, the brand motif, as the illustration. */}
      <svg viewBox="0 0 120 48" className="h-12 w-32" aria-hidden="true">
        <rect x="1" y="1" width="118" height="46" fill="#EEF2F8" stroke="#0B2545" strokeWidth="2" />
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={9 + i * 9} y1="6" x2={9 + i * 9} y2="42" stroke="#0B2545" strokeOpacity="0.15" />
        ))}
        <line x1="104" y1="2" x2="104" y2="46" stroke="#0B2545" strokeWidth="2" />
        <line x1="109" y1="8" x2="109" y2="40" stroke="#0B2545" strokeOpacity="0.6" strokeWidth="2" />
        <line x1="114" y1="8" x2="114" y2="40" stroke="#0B2545" strokeOpacity="0.6" strokeWidth="2" />
      </svg>
      {code && <p className="mt-6 text-sm font-semibold text-pw-muted">{code}</p>}
      <h1 className="mt-2 font-display text-display-sm font-bold text-pw-navy">{title}</h1>
      <p className="mt-3 max-w-[52ch] text-[17px] leading-7 text-pw-muted">{body}</p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-12 items-center rounded-[var(--radius-button)] bg-pw-navy px-5 font-semibold text-white hover:bg-pw-navy-800"
      >
        Back to the calculator
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  usePageTitle("Page not found");
  return <Frame code="404" title="We couldn't find that page." body="The link may be old or mistyped. The calculator is one click away." />;
}

interface BoundaryState {
  failed: boolean;
}

/** Catches render errors so one broken page never blanks the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };
  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Frame
        title="This page stopped working."
        body="Something unexpected happened while showing this page. Reload, or go back to the calculator and start again."
      />
    );
  }
}
