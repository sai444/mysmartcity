import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import type { MapStyle } from "../../api/types";
import { COLORS } from "../../theme/themes";
import { MAP_STYLE_OPTIONS, useMapStyle } from "../map/mapStyles";
import { insetSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { useWard } from "../city/WardContext";
import { useAuth } from "./AuthContext";
import { loginPath, registerPath } from "./paths";
import { ADMIN_DESK, RESIDENT_DESK, type DeskRow } from "./demo";

export default function AccountPage() {
  const { user, ready } = useAuth();
  const { wards } = useWard();

  if (!ready) {
    return <CircularProgress aria-label="Loading account" />;
  }

  if (!user) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 520 }}>
        <Typography variant="h1">Account</Typography>
        <Typography>Sign in to keep your name and ward with your profile.</Typography>
        <Typography color="text.secondary">
          Residents use site sign in. City staff use admin sign in. Each page includes a sample account.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button component={RouterLink} to={loginPath("/account")} variant="contained">
            Site sign in
          </Button>
          <Button component={RouterLink} to={loginPath("/account", "admin")} variant="outlined">
            Admin sign in
          </Button>
          <Button component={RouterLink} to={registerPath("/account")}>
            Create account
          </Button>
        </Stack>
      </Stack>
    );
  }

  const wardName = wards.find((ward) => ward.id === user.ward_id)?.name ?? "Not chosen yet";
  const admin = user.role === "admin";
  const desk = admin ? ADMIN_DESK : user.email === "asha@example.com" ? RESIDENT_DESK : null;
  const initials = user.display_name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Stack spacing={2.5}>
      <Box sx={[surfaceSx, { display: "flex", gap: 2, alignItems: "center", p: { xs: 2, sm: 3 } }]}>
        <Box
          aria-hidden
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
            fontWeight: 700,
            bgcolor: COLORS.selected,
            color: "primary.main",
          }}
        >
          {initials || "MN"}
        </Box>
        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="h1" sx={{ fontSize: { xs: "1.7rem", sm: "2rem" } }}>
              {user.display_name}
            </Typography>
            <Chip label={admin ? "City admin" : "Resident"} color={admin ? "secondary" : "primary"} variant="outlined" />
          </Stack>
          <Typography color="text.secondary">{user.email}</Typography>
          <Typography>Ward: {wardName}</Typography>
        </Stack>
      </Box>

      {admin && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button component={RouterLink} to="/admin" variant="contained">
            Open admin console
          </Button>
          <Button component={RouterLink} to="/shop/mine" variant="outlined">
            Manage shops
          </Button>
          <Button component={RouterLink} to="/travel" variant="outlined">
            Manage transit
          </Button>
        </Stack>
      )}

      <MapStyleSetting />

      {desk && (
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
        }}
      >
        {desk.stats.map((stat) => (
          <Box key={stat.label} sx={surfaceSx}>
            <Typography variant="body2" color="text.secondary">
              {stat.label}
            </Typography>
            <Typography sx={{ fontFamily: '"Outfit", sans-serif', fontSize: "1.8rem", fontWeight: 700 }}>
              {stat.value}
            </Typography>
          </Box>
        ))}
      </Box>
      )}

      {desk ? (
      <Stack spacing={1}>
        <Typography variant="h2">{admin ? "City desk" : "Your activity"}</Typography>
        <Typography color="text.secondary">
          {admin
            ? "Sample work waiting on the city desk. These rows are demo data."
            : "Sample bills, a report, and a recent order for this resident."}
        </Typography>
        {desk.rows.map((row) => (
          <DeskLine key={row.title} row={row} />
        ))}
      </Stack>
      ) : (
        <Typography color="text.secondary">No bills, reports, or orders yet.</Typography>
      )}
    </Stack>
  );
}

function MapStyleSetting() {
  const { style, setStyle } = useMapStyle();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const choose = async (next: MapStyle) => {
    setStatus(null);
    try {
      await setStyle(next);
      setStatus({ ok: true, text: "Saved. Every map in the app now uses this style." });
    } catch {
      setStatus({ ok: false, text: "Could not save to your account. It still applies on this device." });
    }
  };

  return (
    <Stack spacing={1.25} component="section" aria-labelledby="map-style-heading">
      <Typography id="map-style-heading" variant="h2">
        Map style
      </Typography>
      <Typography color="text.secondary">Pick how maps look for you. You can also switch from the button on any map.</Typography>
      <Box role="radiogroup" aria-label="Map style" sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)", md: "repeat(7, 1fr)" } }}>
        {MAP_STYLE_OPTIONS.map((option) => {
          const selected = option.id === style;
          return (
            <Box
              key={option.id}
              component="button"
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => void choose(option.id)}
              sx={[
                surfaceSx,
                {
                  p: 1.25,
                  textAlign: "left",
                  cursor: "pointer",
                  font: "inherit",
                  borderWidth: 2,
                  borderColor: selected ? "primary.main" : "divider",
                },
              ]}
            >
              <Box aria-hidden sx={{ height: 54, borderRadius: 1.5, background: option.swatch, border: "1px solid", borderColor: "divider" }} />
              <Typography sx={{ fontWeight: 700, mt: 1, fontSize: "0.95rem" }}>{option.label}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.82rem", lineHeight: 1.35 }}>
                {option.hint}
              </Typography>
            </Box>
          );
        })}
      </Box>
      {status && <Alert severity={status.ok ? "success" : "warning"}>{status.text}</Alert>}
    </Stack>
  );
}

function DeskLine({ row }: { row: DeskRow }) {
  return (
    <Box sx={insetSurfaceSx}>
      <Typography sx={{ fontWeight: 700 }}>{row.title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {row.meta}
      </Typography>
    </Box>
  );
}
