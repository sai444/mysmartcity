import { Alert, Button, CircularProgress, Stack } from "@mui/material";
import { useState, type FormEvent } from "react";
import { Link as RouterLink, Navigate, useSearchParams } from "react-router-dom";

import { errorMessage, fieldErrors } from "../../api/client";
import { AuthScreen, PasswordField } from "./AuthScreen";
import { useAuth } from "./AuthContext";
import { DemoPanel } from "./DemoPanel";
import type { DemoAccount } from "./demo";
import { EmailField } from "./fields";
import { loginPath, registerPath } from "./paths";

type LoginKind = "site" | "admin";

const COPY: Record<LoginKind, { title: string; lede: string }> = {
  site: {
    title: "Site sign in",
    lede: "Residents pay bills, file reports, and shop in their ward.",
  },
  admin: {
    title: "Admin sign in",
    lede: "City staff publish notices, post bills, and move report status.",
  },
};

export default function LoginPage() {
  return <LoginForm kind="site" />;
}

export function AdminLoginPage() {
  return <LoginForm kind="admin" />;
}

function LoginForm({ kind }: { kind: LoginKind }) {
  const { user, ready, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const copy = COPY[kind];
  const [params] = useSearchParams();
  const requested = params.get("next");
  const next =
    requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : kind === "admin" ? "/admin" : "/city";

  if (!ready) {
    return (
      <AuthScreen title={copy.title} lede={copy.lede} kind={kind}>
        <CircularProgress aria-label="Checking your session" />
      </AuthScreen>
    );
  }
  if (user && kind === "site") return <Navigate to={next} replace />;
  if (user && kind === "admin" && user.role === "admin") return <Navigate to="/city" replace />;
  if (user && kind === "admin") {
    return (
      <AuthScreen title={copy.title} lede={copy.lede} kind={kind}>
        <Stack spacing={2}>
          <Alert severity="info">You are signed in as a resident. Sign out before opening the city desk.</Alert>
          <Button variant="contained" onClick={() => void logout()}>
            Sign out
          </Button>
          <Button component={RouterLink} to="/city">
            Back to the city
          </Button>
        </Stack>
      </AuthScreen>
    );
  }

  async function signIn(nextEmail: string, nextPassword: string) {
    setSubmitting(true);
    setFormError(null);
    try {
      await login(nextEmail.trim(), nextPassword, kind === "admin" ? "admin" : undefined);
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = "Enter your email.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    void signIn(email, password);
  }

  function onPick(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({});
    void signIn(account.email, account.password);
  }

  return (
    <AuthScreen title={copy.title} lede={copy.lede} kind={kind} aside={<DemoPanel kind={kind} onPick={onPick} busy={submitting} />}>
      <Stack component="form" spacing={2} noValidate onSubmit={onSubmit} aria-busy={submitting}>
        <LoginKindSwitch kind={kind} />
        {formError && <Alert severity="error">{formError}</Alert>}
        <EmailField value={email} onChange={setEmail} error={errors.email} autoComplete="email" />
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
        />
        <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
          {submitting ? "Signing in…" : kind === "admin" ? "Sign in to the desk" : "Sign in"}
        </Button>
        {kind === "site" ? (
          <Button component={RouterLink} to={registerPath(requested ?? undefined)} fullWidth>
            Create an account
          </Button>
        ) : (
          <Button component={RouterLink} to={loginPath(requested ?? undefined)} fullWidth>
            Resident? Use site sign in
          </Button>
        )}
      </Stack>
    </AuthScreen>
  );
}

function LoginKindSwitch({ kind }: { kind: LoginKind }) {
  const [params] = useSearchParams();
  const next = params.get("next") ?? undefined;
  return (
    <Stack direction="row" spacing={1} role="navigation" aria-label="Sign in as">
      <Button
        component={RouterLink}
        to={loginPath(next)}
        variant={kind === "site" ? "contained" : "outlined"}
        aria-current={kind === "site" ? "page" : undefined}
        sx={{ flex: 1, minHeight: 44 }}
      >
        Site
      </Button>
      <Button
        component={RouterLink}
        to={loginPath(next, "admin")}
        variant={kind === "admin" ? "contained" : "outlined"}
        aria-current={kind === "admin" ? "page" : undefined}
        sx={{ flex: 1, minHeight: 44 }}
      >
        Admin
      </Button>
    </Stack>
  );
}
