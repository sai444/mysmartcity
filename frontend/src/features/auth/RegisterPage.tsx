import { Alert, Button, CircularProgress, MenuItem, Stack, TextField } from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, Navigate, useSearchParams } from "react-router-dom";

import { errorMessage, fieldErrors } from "../../api/client";
import { useFeatures } from "../admin/FeatureContext";
import { useWard } from "../city/WardContext";
import { AuthScreen, PasswordField } from "./AuthScreen";
import { useAuth } from "./AuthContext";
import { EmailField } from "./fields";
import { loginPath } from "./paths";

export default function RegisterPage() {
  const { user, ready, register } = useAuth();
  const { isEnabled } = useFeatures();
  const { wards, wardId } = useWard();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ward, setWard] = useState(wardId);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [params] = useSearchParams();
  const requested = params.get("next");
  const next = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/city";

  useEffect(() => {
    if (!ward && wardId) setWard(wardId);
  }, [ward, wardId]);

  if (!ready) {
    return (
      <AuthScreen title="Create account" lede="Register to report issues, pay bills, and place orders.">
        <CircularProgress aria-label="Checking your session" />
      </AuthScreen>
    );
  }
  if (user) return <Navigate to={next} replace />;

  if (!isEnabled("registration")) {
    return (
      <AuthScreen title="Sign-ups are paused" lede="The city admin has paused new accounts for now. Please check back later.">
        <Stack spacing={1}>
          <Button component={RouterLink} to={loginPath(requested ?? undefined)} variant="contained" size="large">
            Sign in to an existing account
          </Button>
          <Button component={RouterLink} to="/city">
            Back to city home
          </Button>
        </Stack>
      </AuthScreen>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!displayName.trim()) next.display_name = "Enter a display name.";
    if (!email.trim() || !email.includes("@")) next.email = "Enter a valid email.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (password !== confirm) next.confirm = "Those passwords do not match.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await register({
        display_name: displayName.trim(),
        email: email.trim(),
        password,
        ward_id: ward || undefined,
      });
    } catch (error) {
      const mapped = fieldErrors(error);
      if (!mapped.email && errorMessage(error).toLowerCase().includes("email")) {
        mapped.email = errorMessage(error);
      }
      setErrors(mapped);
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen title="Create account" lede="Register to report issues, pay bills, and place orders.">
      <Stack component="form" spacing={2} noValidate onSubmit={onSubmit} aria-busy={submitting}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <TextField
          id="display-name"
          label="Display name"
          autoComplete="nickname"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={Boolean(errors.display_name)}
          helperText={errors.display_name || "This is the name other residents see."}
          required
          fullWidth
          autoFocus
          slotProps={{
            htmlInput: { "aria-describedby": "display-name-help", maxLength: 80 },
            formHelperText: { id: "display-name-help" },
          }}
        />
        <EmailField value={email} onChange={setEmail} error={errors.email} autoComplete="email" />
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={errors.password}
          helperText="At least 8 characters."
        />
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={errors.confirm}
        />
        <TextField
          select
          id="ward"
          label="Ward"
          value={ward}
          onChange={(event) => setWard(event.target.value)}
          helperText={errors.ward_id || "City home opens on this ward."}
          error={Boolean(errors.ward_id)}
          disabled={!wards.length}
          fullWidth
          slotProps={{
            htmlInput: { "aria-describedby": "ward-help" },
            formHelperText: { id: "ward-help" },
          }}
        >
          {wards.every((item) => item.id !== ward) && (
            <MenuItem value="" disabled>
              Loading wards…
            </MenuItem>
          )}
          {wards.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
        <Button component={RouterLink} to={loginPath(requested ?? undefined)}>
          Already have an account? Site sign in
        </Button>
        <Button component={RouterLink} to={loginPath(requested ?? undefined, "admin")}>
          City staff? Admin sign in
        </Button>
      </Stack>
    </AuthScreen>
  );
}
