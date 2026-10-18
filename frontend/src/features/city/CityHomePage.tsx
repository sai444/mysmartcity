import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet } from "../../api/client";
import type { CityHome } from "../../api/types";
import { kickerSx, surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { CityPulse } from "./CityPulse";
import { ClimateCard } from "./ClimateCard";
import { ServiceGrid } from "./ServiceGrid";
import { useWard } from "./WardContext";

export default function CityHomePage() {
  const { user, updateProfile } = useAuth();
  const { wards, wardId, setWardId, loading: wardsLoading, error: wardsError, reload } = useWard();
  const [home, setHome] = useState<CityHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!wardId) return;
    let active = true;
    setLoading(true);
    apiGet<CityHome>(`/api/v1/city/home?ward_id=${encodeURIComponent(wardId)}`)
      .then((payload) => {
        if (active) {
          setHome(payload);
          setError(null);
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [wardId]);

  useEffect(() => {
    if (!user) {
      syncedUserId.current = null;
      return;
    }
    if (!wards.length || syncedUserId.current === user.id) return;
    syncedUserId.current = user.id;
    if (user.ward_id && wards.some((ward) => ward.id === user.ward_id)) {
      setWardId(user.ward_id);
    }
  }, [user, wards, setWardId]);

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography sx={kickerSx}>Live ward</Typography>
        <Typography variant="h1">City home</Typography>
        {user && (
          <Typography>
            {`Welcome, ${user.display_name}.${user.role === "admin" ? " You are signed in as city admin." : ""}`}
          </Typography>
        )}
        <Typography color="text.secondary">
          Pulse, live weather for this ward’s map point, and the services around it.
        </Typography>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <TextField
          select
          label="Ward"
          value={wardId}
          onChange={(event) => {
            const next = event.target.value;
            setWardId(next);
            if (user && next !== user.ward_id) void updateProfile({ ward_id: next });
          }}
          disabled={!wards.length}
          sx={{ width: "100%", maxWidth: 360 }}
        >
          {wards.map((ward) => (
            <MenuItem key={ward.id} value={ward.id}>
              {ward.name}
            </MenuItem>
          ))}
        </TextField>
        {user?.role === "admin" && (
          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to="/admin?tab=city" variant="contained">
              Edit city home
            </Button>
            <Button component={RouterLink} to="/admin?tab=notices">
              Post a notice
            </Button>
          </Stack>
        )}
      </Stack>

      {(wardsError || error) && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={reload}>
              Retry
            </Button>
          }
        >
          {wardsError ?? error}
        </Alert>
      )}

      {(wardsLoading || loading) && !home && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress aria-label="Loading city home" />
        </Box>
      )}

      {home && (
        <>
          <CityPulse systems={home.systems} />
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 2fr) minmax(220px, 1fr)" },
            }}
          >
            <ClimateCard climate={home.climate} wardName={home.ward.name} />
            <Box sx={[surfaceSx, { display: { xs: "none", sm: "flex" }, flexDirection: "column", gap: 1.5 }]}>
                <Typography variant="h2">Notices</Typography>
                {home.notices.length === 0 && <Typography>No active notices.</Typography>}
                {home.notices.slice(0, 2).map((notice) => (
                  <Button
                    key={notice.id}
                    component={RouterLink}
                    to={`/city/notices/${notice.id}`}
                    sx={{ justifyContent: "flex-start", textAlign: "left", alignItems: "flex-start" }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{notice.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {notice.severity === "emergency" ? "Emergency" : notice.severity === "warning" ? "Warning" : "Info"}
                        {notice.ward_id ? "" : " · All wards"}
                      </Typography>
                    </Box>
                  </Button>
                ))}
            </Box>
          </Box>
          <ServiceGrid home={home} />
        </>
      )}
    </Stack>
  );
}
