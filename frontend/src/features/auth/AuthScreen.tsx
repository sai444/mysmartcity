import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { AppBar, Box, IconButton, InputAdornment, TextField, Toolbar, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";

import { Brand } from "../../shells/Brand";
import { COLORS } from "../../theme/themes";

export function AuthScreen({
  title,
  lede,
  aside,
  children,
  kind = "site",
}: {
  title: string;
  lede: string;
  aside?: ReactNode;
  children: ReactNode;
  kind?: "site" | "admin";
}) {
  const admin = kind === "admin";

  const card = (
    <Box
      sx={{
        width: "100%",
        maxWidth: 460,
        mx: aside ? 0 : "auto",
        p: { xs: 2.5, sm: 3.5 },
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        borderTop: "4px solid",
        borderTopColor: admin ? "warning.main" : "primary.main",
        bgcolor: "background.paper",
        boxShadow: COLORS.shadowLg,
      }}
    >
      <Typography
        sx={{
          mb: 1,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontSize: "0.75rem",
          color: admin ? "warning.main" : "primary.main",
        }}
      >
        {admin ? "City desk" : "MyNagari"}
      </Typography>
      <Typography variant="h1" sx={{ mb: 1, fontSize: { xs: "1.75rem", sm: "2.1rem" } }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {lede}
      </Typography>
      {children}
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="inherit"
        sx={{
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
          color: "text.primary",
        }}
      >
        <Toolbar sx={{ gap: 1, px: { xs: 1.5, sm: 2 } }}>
          <Brand />
        </Toolbar>
      </AppBar>
      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: aside ? { xs: "1fr", md: "minmax(0, 1.05fr) minmax(280px, 440px)" } : "1fr",
          gap: { xs: 3, md: 5 },
          alignItems: "center",
          width: "min(1080px, 100%)",
          mx: "auto",
          px: { xs: 2, sm: 3, md: 4 },
          py: { xs: 2.5, md: 5 },
        }}
      >
        {aside && <Box sx={{ order: { xs: 2, md: 1 }, minWidth: 0 }}>{aside}</Box>}
        <Box sx={{ order: { xs: 1, md: 2 }, minWidth: 0 }}>
          {card}
        </Box>
      </Box>
    </Box>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  helperText,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  helperText?: string;
}) {
  const [visible, setVisible] = useState(false);
  const helpId = `${id}-help`;

  return (
    <TextField
      id={id}
      label={label}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      helperText={error || helperText}
      required
      fullWidth
      slotProps={{
        htmlInput: { "aria-describedby": helpId },
        formHelperText: { id: helpId },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible((current) => !current)}
                edge="end"
              >
                {visible ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
