import { Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";

import { apiGet } from "../../api/client";
import type { Facility, Notice, Page, ParkingLot, WasteWindow } from "../../api/types";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { WASTE_NOTES } from "../life/catalog";
import { reserveParking } from "../life/store";
import { PageIntro, Surface } from "../life/ui";
import { KIND_LABEL, WASTE_LABEL, rupees } from "./labels";
import { useWard } from "./WardContext";

function Loading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress />
    </Box>
  );
}

export default function WastePage() {
  const { wardId, wards } = useWard();
  const [rows, setRows] = useState<WasteWindow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wardName = wards.find((ward) => ward.id === wardId)?.name ?? "this ward";
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

  useEffect(() => {
    if (!wardId) return;
    apiGet<{ data: WasteWindow[] }>(`/api/v1/city/waste?ward_id=${encodeURIComponent(wardId)}`)
      .then((payload) => setRows(payload.data))
      .catch((reason: Error) => setError(reason.message));
  }, [wardId]);

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="COLLECTION"
        title="Waste today"
        lede={`What ${wardName} should put out on ${today}. Leave it at the gate before the window opens.`}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Typography>No collection today.</Typography>}
      {rows?.map((row) => (
        <Surface key={`${row.waste_type}-${row.window_label}`}>
          <Stack spacing={1}>
            <Chip label="Today" color="primary" variant="outlined" sx={{ alignSelf: "flex-start" }} />
            <Typography variant="h2">{WASTE_LABEL[row.waste_type] ?? row.waste_type}</Typography>
            <Typography sx={{ fontSize: "1.6rem", fontWeight: 700 }}>{row.window_label}</Typography>
            <Typography>{WASTE_NOTES[row.waste_type] ?? "Set the bag out before the truck arrives."}</Typography>
            <Typography variant="body2" color="text.secondary">
              This window repeats every day in {wardName}.
            </Typography>
          </Stack>
        </Surface>
      ))}
    </Stack>
  );
}

export function ParkingPage() {
  const { wardId } = useWard();
  const { user, ready } = useAuth();
  const signIn = useLoginPath();
  const [rows, setRows] = useState<ParkingLot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hours, setHours] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!wardId) return;
    apiGet<Page<ParkingLot>>(`/api/v1/city/parking?ward_id=${encodeURIComponent(wardId)}&limit=50`)
      .then((payload) => setRows(payload.data))
      .catch((reason: Error) => setError(reason.message));
  }, [wardId]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter((lot) => !needle || lot.name.toLowerCase().includes(needle) || lot.address_text.toLowerCase().includes(needle));
  }, [rows, query]);

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="PUBLIC LOTS"
        title="Parking"
        lede="Reserve an hour at a lot that still has space. The session shows up on Activity."
      />
      <TextField label="Search lots" value={query} onChange={(event) => setQuery(event.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <Loading />}
      <Stack spacing={1.5}>
        {visible.map((lot) => {
          const span = hours[lot.id] ?? 1;
          const full = lot.spaces_free < 1;
          return (
            <Surface key={lot.id}>
              <Stack spacing={1}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                  <Stack>
                    <Typography sx={{ fontWeight: 700 }}>{lot.name}</Typography>
                    <Typography color="text.secondary">{lot.address_text}</Typography>
                  </Stack>
                  <Chip
                    label={full ? "Full" : `${lot.spaces_free} of ${lot.capacity} free`}
                    color={full ? "default" : "success"}
                    variant="outlined"
                    sx={{ alignSelf: "flex-start" }}
                  />
                </Stack>
                <Typography>
                  {rupees(lot.price_paise_per_hour)} / hour · {span} {span === 1 ? "hour" : "hours"} · {rupees(lot.price_paise_per_hour * span)}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Button size="small" disabled={span <= 1} onClick={() => setHours((current) => ({ ...current, [lot.id]: span - 1 }))}>
                    −
                  </Button>
                  <Typography>{span}h</Typography>
                  <Button size="small" disabled={span >= 6} onClick={() => setHours((current) => ({ ...current, [lot.id]: span + 1 }))}>
                    +
                  </Button>
                  {ready && !user ? (
                    <Button variant="contained" component={RouterLink} to={signIn} disabled={full}>
                      Sign in to reserve
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      disabled={full || !ready || !user}
                      onClick={() => {
                        if (!user) return;
                        reserveParking(user.id, lot.name, span, lot.price_paise_per_hour * span);
                        setNote(`Reserved ${span}h at ${lot.name}.`);
                      }}
                    >
                      {full ? "No space" : "Reserve"}
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Surface>
          );
        })}
      </Stack>
      {note && <Typography>{note}</Typography>}
    </Stack>
  );
}

const FACILITY_FILTERS = [
  { id: "", label: "All" },
  { id: "clinic", label: "Clinics" },
  { id: "park", label: "Parks" },
  { id: "toilet", label: "Toilets" },
  { id: "ev_charger", label: "EV chargers" },
  { id: "ward_office", label: "Ward office" },
];

export function FacilitiesPage() {
  const { wardId } = useWard();
  const [rows, setRows] = useState<Facility[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!wardId) return;
    const params = new URLSearchParams({ ward_id: wardId, limit: "50" });
    if (kind) params.set("kind", kind);
    if (query.trim()) params.set("q", query.trim());
    apiGet<Page<Facility>>(`/api/v1/city/facilities?${params.toString()}`)
      .then((payload) => setRows(payload.data))
      .catch((reason: Error) => setError(reason.message));
  }, [wardId, kind, query]);

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="PUBLIC PLACES"
        title="Facilities"
        lede="Clinics, parks, toilets, EV chargers, and the ward office. Open one on the city map when you need the pin."
      />
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {FACILITY_FILTERS.map((item) => (
          <Chip
            key={item.id || "all"}
            label={item.label}
            clickable
            color={kind === item.id ? "primary" : "default"}
            variant={kind === item.id ? "filled" : "outlined"}
            onClick={() => setKind(item.id)}
          />
        ))}
      </Stack>
      <TextField label="Search" value={query} onChange={(event) => setQuery(event.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Typography>Nothing in this ward matches.</Typography>}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        {rows?.map((place) => (
          <Surface key={place.id}>
            <Stack spacing={0.5}>
              <Chip label={KIND_LABEL[place.kind] ?? place.kind} size="small" variant="outlined" sx={{ alignSelf: "flex-start" }} />
              <Typography sx={{ fontWeight: 700 }}>{place.name}</Typography>
              <Typography>{place.address_text}</Typography>
              <Typography color="text.secondary">Open {place.opening_hours}</Typography>
              {place.phone && <Typography>{place.phone}</Typography>}
              <Button component={RouterLink} to="/map" sx={{ alignSelf: "flex-start" }}>
                Show on map
              </Button>
            </Stack>
          </Surface>
        ))}
      </Box>
    </Stack>
  );
}

export function NoticesPage() {
  const { wardId } = useWard();
  const [rows, setRows] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wardId) return;
    apiGet<{ data: Notice[] }>(`/api/v1/city/notices?ward_id=${encodeURIComponent(wardId)}`)
      .then((payload) => setRows(payload.data))
      .catch((reason: Error) => setError(reason.message));
  }, [wardId]);

  return (
    <Stack spacing={2.5}>
      <PageIntro kicker="ALERTS" title="Notices" lede="Citywide warnings and messages for this ward, newest first." />
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Typography>No active notices.</Typography>}
      <Stack spacing={1.5}>
        {rows?.map((notice) => (
          <Surface key={notice.id}>
            <Stack spacing={0.75}>
              <Chip
                label={notice.severity === "emergency" ? "Emergency" : notice.severity === "warning" ? "Warning" : "Info"}
                color={notice.severity === "emergency" ? "error" : notice.severity === "warning" ? "warning" : "info"}
                variant="outlined"
                sx={{ alignSelf: "flex-start" }}
              />
              <Typography sx={{ fontWeight: 700 }}>{notice.title}</Typography>
              <Typography>{notice.body}</Typography>
              <Button component={RouterLink} to={`/city/notices/${notice.id}`} sx={{ alignSelf: "flex-start" }}>
                Open notice
              </Button>
            </Stack>
          </Surface>
        ))}
      </Stack>
    </Stack>
  );
}

export function NoticeDetailPage() {
  const { noticeId } = useParams();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noticeId) return;
    apiGet<Notice>(`/api/v1/city/notices/${noticeId}`)
      .then(setNotice)
      .catch((reason: Error) => setError(reason.message));
  }, [noticeId]);

  return (
    <Stack spacing={2.5}>
      <PageIntro kicker="ALERT" title="Notice" lede="City and ward alerts." />
      <Button component={RouterLink} to="/city/notices" sx={{ alignSelf: "flex-start" }}>
        All notices
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {!notice && !error && <Loading />}
      {notice && (
        <Surface>
          <Stack spacing={1.25}>
            <Chip
              label={notice.severity === "emergency" ? "Emergency" : notice.severity === "warning" ? "Warning" : "Info"}
              color={notice.severity === "emergency" ? "error" : notice.severity === "warning" ? "warning" : "info"}
              variant="outlined"
              sx={{ alignSelf: "flex-start" }}
            />
            <Typography variant="h2">{notice.title}</Typography>
            <Typography>
              {notice.ward_id ? "This ward" : "All wards"} · until{" "}
              {new Date(notice.ends_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </Typography>
            <Typography sx={{ maxWidth: 640 }}>{notice.body}</Typography>
          </Stack>
        </Surface>
      )}
    </Stack>
  );
}
