import { TextField } from "@mui/material";

export function EmailField({
  value,
  onChange,
  error,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete: string;
}) {
  return (
    <TextField
      id="email"
      label="Email"
      type="email"
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      helperText={error}
      required
      fullWidth
      autoFocus
      slotProps={{
        htmlInput: { "aria-describedby": error ? "email-error" : undefined },
        formHelperText: { id: "email-error" },
      }}
    />
  );
}
