import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { Activity, ArrowLeftRight, FileUp, LayoutGrid, LogOut, Percent, Tags } from "lucide-react";
import { cn } from "@/lib/cn";
import { Wordmark } from "@/components/Brand";
import { usePageTitle } from "@/components/usePageTitle";
import { adminApi, setUnauthorizedHandler, tokenStore, type Admin } from "./api";
import { LoginPage } from "./LoginPage";
import { OverviewPage } from "./OverviewPage";
import { TariffsPage } from "./TariffsPage";
import { ImportPage } from "./ImportPage";
import { LeviesPage } from "./LeviesPage";
import { FxPage } from "./FxPage";
import { ActivityPage } from "./ActivityPage";

interface Session {
  admin: Admin | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside AdminApp");
  return s;
};

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/admin/tariffs", label: "Tariffs", icon: Tags },
  { to: "/admin/import", label: "Import", icon: FileUp },
  { to: "/admin/levies", label: "Levies and VAT", icon: Percent },
  { to: "/admin/fx", label: "Exchange rates", icon: ArrowLeftRight },
  { to: "/admin/activity", label: "Activity", icon: Activity },
];

export default function AdminApp() {
  usePageTitle("Admin");
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(() => !!tokenStore.get());

  const signOut = useCallback(() => {
    tokenStore.clear();
    setAdmin(null);
    navigate("/admin/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!tokenStore.get()) return;
    adminApi
      .me()
      .then(setAdmin)
      .catch(() => tokenStore.clear())
      .finally(() => setChecking(false));
  }, [signOut]);

  const session = useMemo<Session>(
    () => ({
      admin,
      signOut,
      signIn: async (email, password) => {
        const res = await adminApi.login(email, password);
        tokenStore.set(res.token, res.expires_at);
        setAdmin(res.admin);
      },
    }),
    [admin, signOut],
  );

  if (checking) return <div className="min-h-dvh bg-pw-bg" aria-busy="true" />;

  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route path="login" element={admin ? <Navigate to="/admin" replace /> : <LoginPage />} />
        <Route
          path="*"
          element={
            admin ? (
              <Shell>
                <Routes>
                  <Route index element={<OverviewPage />} />
                  <Route path="tariffs" element={<TariffsPage />} />
                  <Route path="import" element={<ImportPage />} />
                  <Route path="levies" element={<LeviesPage />} />
                  <Route path="fx" element={<FxPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </Shell>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
      </Routes>
    </SessionContext.Provider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { admin, signOut } = useSession();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-input)] px-3 text-sm font-medium transition-colors",
      isActive ? "bg-pw-navy text-white" : "text-pw-text hover:bg-pw-bg",
    );
  return (
    <div className="min-h-dvh bg-pw-bg">
      <header className="bg-pw-navy">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/admin" aria-label="PortWise admin home" className="rounded-md">
              <Wordmark inverted />
            </Link>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-pw-on-navy">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="hidden min-h-11 items-center rounded-md px-3 text-sm text-pw-on-navy hover:text-white sm:inline-flex">
              Open calculator
            </Link>
            <span className="hidden text-sm text-pw-on-navy md:inline">{admin?.email}</span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-white hover:bg-white/10"
            >
              <LogOut className="size-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-8">
        <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:sticky lg:top-6 lg:flex-col">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className={link}>
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
