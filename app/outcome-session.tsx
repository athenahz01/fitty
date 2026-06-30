"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase";

export type CaptureStatus = "loading" | "disabled" | "enabled" | "error";
export type AuthStatus = "idle" | "checking" | "signedOut" | "signedIn" | "error";
export type SubmitStatus = "idle" | "saving" | "success" | "error";

type ApiErrorPayload = {
  error?: string;
};

type OutcomeSessionContextValue = {
  captureStatus: CaptureStatus;
  captureError: string;
  authStatus: AuthStatus;
  authError: string;
  accessToken: string;
  signedIn: boolean;
  email: string;
  password: string;
  resetVersion: number;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  handleSignIn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleSignOut: () => Promise<void>;
  resetLocalOutcomeState: () => void;
};

const OutcomeSessionContext = createContext<OutcomeSessionContextValue | null>(null);

export function OutcomeSessionProvider({ children }: { children: ReactNode }) {
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("loading");
  const [captureError, setCaptureError] = useState("");
  const [supabase, setSupabase] = useState<ReturnType<
    typeof createSupabaseBrowserClient
  > | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [authError, setAuthError] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetVersion, setResetVersion] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/outcomes/status");
        const payload = (await response.json()) as { enabled?: boolean };

        if (!response.ok) {
          throw new Error("Outcome capture status is unavailable.");
        }

        if (active) {
          setCaptureStatus(payload.enabled ? "enabled" : "disabled");
          setCaptureError("");
        }
      } catch (error) {
        if (active) {
          setCaptureStatus("error");
          setCaptureError(
            error instanceof Error
              ? error.message
              : "Outcome capture status is unavailable.",
          );
        }
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (captureStatus !== "enabled") {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const client = createSupabaseBrowserClient();
      setSupabase(client);
      setAuthStatus("checking");

      void client.auth
        .getSession()
        .then(({ data }) => {
          if (!active) {
            return;
          }

          setAccessToken(data.session?.access_token ?? "");
          setAuthStatus(data.session ? "signedIn" : "signedOut");
          setAuthError("");
        })
        .catch((error: unknown) => {
          if (!active) {
            return;
          }

          setAuthStatus("error");
          setAuthError(
            error instanceof Error ? error.message : "Could not read the session.",
          );
        });

      const listener = client.auth.onAuthStateChange((_event, session) => {
        setAccessToken(session?.access_token ?? "");
        setAuthStatus(session ? "signedIn" : "signedOut");
        setAuthError("");
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    } catch (error) {
      setAuthStatus("error");
      setAuthError(
        error instanceof Error ? error.message : "Sign-in is not available right now.",
      );
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [captureStatus]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthError("Sign-in is not available right now.");
      return;
    }

    setAuthStatus("checking");
    setAuthError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setAuthStatus("signedOut");
      setAuthError(error?.message ?? "Sign-in did not return a session.");
      return;
    }

    setAccessToken(data.session.access_token);
    setAuthStatus("signedIn");
    setPassword("");
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setAccessToken("");
    setAuthStatus("signedOut");
    setPassword("");
    resetLocalOutcomeState();
  }

  function resetLocalOutcomeState() {
    setResetVersion((current) => current + 1);
  }

  const value: OutcomeSessionContextValue = {
    captureStatus,
    captureError,
    authStatus,
    authError,
    accessToken,
    signedIn: authStatus === "signedIn" && Boolean(accessToken),
    email,
    password,
    resetVersion,
    setEmail,
    setPassword,
    handleSignIn,
    handleSignOut,
    resetLocalOutcomeState,
  };

  return (
    <OutcomeSessionContext.Provider value={value}>
      {children}
    </OutcomeSessionContext.Provider>
  );
}

export function useOutcomeSession() {
  const context = useContext(OutcomeSessionContext);
  if (!context) {
    throw new Error("useOutcomeSession must be used inside OutcomeSessionProvider.");
  }
  return context;
}

export async function fetchOutcomeJson<T>(
  path: string,
  accessToken: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;

  if (response.status === 401) {
    throw new Error("Please sign in again before continuing.");
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "The request could not be completed.");
  }

  return payload;
}

export function OutcomeSignInGate() {
  const {
    authStatus,
    authError,
    email,
    password,
    setEmail,
    setPassword,
    handleSignIn,
  } = useOutcomeSession();

  return (
    <form className="capture-body capture-form" onSubmit={handleSignIn}>
      <div className="capture-step">
        <div className="section-kicker">Sign in required</div>
        <p className="helper mt-2">
          Sign in to save your consent, application outcomes, or data requests.
          Only you can see your data.
        </p>
      </div>
      <div className="capture-form-grid two">
        <label className="control">
          <span className="field-label">Email</span>
          <input
            className="text-control"
            autoComplete="email"
            inputMode="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="control">
          <span className="field-label">Password</span>
          <input
            className="text-control"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      </div>
      {authError ? (
        <p className="error-copy" role="alert">
          {authError}
        </p>
      ) : null}
      <button
        className="capture-primary"
        type="submit"
        disabled={authStatus === "checking"}
      >
        {authStatus === "checking" ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
