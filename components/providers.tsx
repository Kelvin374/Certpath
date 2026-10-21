"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { syncableState, useApp } from "@/lib/store";
import type { SyncableState } from "@/lib/store";

/* -------------------------------------------------------------------------
 * Auth context
 * ---------------------------------------------------------------------- */

export interface AccountUser {
  id: string;
  email: string;
  name: string | null;
}

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface AuthContextValue {
  user: AccountUser | null;
  /** False when no DATABASE_URL is configured — the app runs guest-only. */
  accountsEnabled: boolean;
  loading: boolean;
  syncStatus: SyncStatus;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  accountsEnabled: false,
  loading: true,
  syncStatus: "idle",
  signOut: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/* -------------------------------------------------------------------------
 * Boot screen
 * ---------------------------------------------------------------------- */

function BootScreen() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative grid h-14 w-14 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-2xl bg-accent/20" />
          <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
              <path
                d="M12 2 4 5.5v6c0 4.6 3.2 8.8 8 10.5 4.8-1.7 8-5.9 8-10.5v-6L12 2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="m8.5 12 2.5 2.5 4.5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold">CertPath</p>
          <p className="text-xs text-muted-foreground">Loading your study state…</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Providers
 * ---------------------------------------------------------------------- */

export function Providers({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [accountsEnabled, setAccountsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const lastSent = useRef<string>("");
  const userRef = useRef<AccountUser | null>(null);

  /* ── 1. Rehydrate the persisted store ─────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    const unsub = useApp.persist.onFinishHydration(() => {
      if (!cancelled) setHydrated(true);
    });
    void useApp.persist.rehydrate();

    // Safety net: never leave the boot screen up if storage is unavailable.
    const timer = setTimeout(() => {
      if (!cancelled) setHydrated(true);
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub();
    };
  }, []);

  /* ── 2. Theme ─────────────────────────────────────────────────────── */
  const theme = useApp((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme !== "light");
  }, [theme]);

  /* ── 3. Push local state to the account ───────────────────────────── */
  const pushState = useCallback(async () => {
    if (!userRef.current) return;
    const body = JSON.stringify(syncableState(useApp.getState()));
    lastSent.current = body;
    setSyncStatus("saving");
    try {
      const res = await fetch("/api/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
      });
      setSyncStatus(res.ok ? "saved" : "error");
    } catch {
      setSyncStatus("offline");
    }
  }, []);

  /* ── 4. Load the account + server state ───────────────────────────── */
  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));

      setAccountsEnabled(Boolean(payload.accountsEnabled));

      if (res.status === 401 || !payload.user) {
        userRef.current = null;
        setUser(null);
        setSyncStatus(payload.accountsEnabled ? "idle" : "offline");
        return;
      }

      userRef.current = payload.user as AccountUser;
      setUser(payload.user as AccountUser);

      const serverState = payload.state as SyncableState | null;
      const local = useApp.getState();
      const localHasData =
        local.onboarded ||
        local.pastAttempts.length > 0 ||
        local.plans.length > 0 ||
        Object.keys(local.reviews).length > 0;

      if (serverState && !localHasData) {
        // First sign-in on a clean device — adopt what the account already has.
        useApp.getState().hydrate(serverState);
        lastSent.current = JSON.stringify(syncableState(useApp.getState()));
        setSyncStatus("saved");
      } else {
        // Local work exists (including guest work) — keep it and push it up.
        await pushState();
      }
    } catch {
      setSyncStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [pushState]);

  useEffect(() => {
    if (!hydrated) return;
    void loadAccount();
  }, [hydrated, loadAccount]);

  /* ── 5. Debounced auto-sync ───────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useApp.subscribe((state) => {
      if (!userRef.current) return;
      const next = JSON.stringify(syncableState(state));
      if (next === lastSent.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void pushState();
      }, 1200);
    });

    // Make sure the account reflects the current state right away.
    void pushState();

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [user, pushState]);

  /* ── 6. Sign out ──────────────────────────────────────────────────── */
  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the request fails, drop the local session view.
    }
    userRef.current = null;
    setUser(null);
    setSyncStatus("idle");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, accountsEnabled, loading, syncStatus, signOut, refresh: loadAccount }),
    [user, accountsEnabled, loading, syncStatus, signOut, loadAccount],
  );

  if (!hydrated) return <BootScreen />;

  return (
    <AuthContext.Provider value={value}>
      <>{children}</>
    </AuthContext.Provider>
  );
}
