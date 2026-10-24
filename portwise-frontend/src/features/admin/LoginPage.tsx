import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/lib/api/client";
import { Alert, Button, Field, TextInput } from "@/components/ui/primitives";
import { LogoMark } from "@/components/Brand";
import { useSession } from "./AdminApp";

export function LoginPage() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-pw-navy px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3 text-white">
          <LogoMark inverted className="size-10" />
          <div>
            <p className="font-display text-xl font-semibold">PortWise admin</p>
            <p className="text-sm text-pw-on-navy">Tariffs, levies and exchange rates</p>
          </div>
        </div>
        <form
          className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-pop)]"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await signIn(email.trim(), password);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Sign-in failed. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h1 className="font-display text-lg font-semibold text-pw-navy">Sign in</h1>
          <div className="mt-5 space-y-4">
            <Field id="email" label="Email">
              <TextInput id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field id="password" label="Password">
              <TextInput
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <Alert tone="error" title={error} />}
            <Button type="submit" className="h-12 w-full" loading={busy} loadingLabel="Signing in">
              Sign in
            </Button>
          </div>
        </form>
        <p className="mt-6 text-center text-sm text-pw-on-navy">
          <Link to="/" className="hover:text-white hover:underline">
            Back to the calculator
          </Link>
        </p>
      </div>
    </div>
  );
}
