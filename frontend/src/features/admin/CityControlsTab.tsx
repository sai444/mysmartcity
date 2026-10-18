import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet, apiRequest, errorMessage } from "../../api/client";
import type { CitySection, ParkingLot, WardControls } from "../../api/types";
import { insetSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { AQI_LABEL, aqiCategory, CONDITION_LABEL, PULSE_STATE, rupees, WASTE_LABEL } from "../city/labels";
import { useWard } from "../city/WardContext";

type Save = (path: string, method: "PUT" | "PATCH" | "DELETE", body?: unknown, done?: string) => Promise<boolean>;

export function CityControlsTab() {
  const { wards, wardId, setWardId } = useWard();
  const [ward, setWard] = useState(wardId);
  const [controls, setControls] = useState<WardControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ward && wardId) setWard(wardId);
  }, [ward, wardId]);

  useEffect(() => {
    if (!ward) return;
    let active = true;
    setControls(null);
    setError(null);
    setSaved(null);
    apiGet<WardControls>(`/api/v1/admin/city/${encodeURIComponent(ward)}`)
      .then((payload) => {
        if (active) setControls(payload);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [ward]);

  const save: Save = async (path, method, body, done = "Saved. City home shows the change now.") => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      setControls(await apiRequest<WardControls>(path, { method, body }));
      setSaved(done);
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const base = `/api/v1/admin/city/${encodeURIComponent(ward)}`;
  const reset = (section: CitySection) => save(`${base}/${section}`, "DELETE", undefined, "Back to the default values.");

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <TextField select label="Ward" value={ward} onChange={(event) => setWard(event.target.value)} size="small" sx={{ minWidth: 240 }}>
          {wards.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <Typography color="text.secondary" sx={{ flex: 1 }}>
          Changes show on City home for this ward straight away. Notices are on the Notices tab.
        </Typography>
        <Button component={RouterLink} to="/city" onClick={() => setWardId(ward)} sx={{ flex: "0 0 auto" }}>
          View city home
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{saved}</Alert>}
      {!controls && !error && <CircularProgress aria-label="Loading city home controls" />}

      {controls && (
        <Box key={controls.ward.id} sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, alignItems: "start" }}>
          <PulseForm controls={controls} busy={busy} onSave={(systems) => save(`${base}/pulse`, "PUT", { systems })} onReset={() => void reset("pulse")} />
          <ClimateForm controls={controls} busy={busy} onSave={(body) => save(`${base}/climate`, "PUT", body)} onReset={() => void reset("climate")} />
          <WasteForm controls={controls} busy={busy} onSave={(body) => save(`${base}/waste`, "PUT", body)} onReset={() => void reset("waste")} />
          <ParkingForm lots={controls.parking} busy={busy} onSave={(lot, body) => save(`/api/v1/admin/parking/${lot.id}`, "PATCH", body, `${lot.name} updated.`)} />
        </Box>
      )}
    </Stack>
  );
}

function Panel({
  title,
  hint,
  edited,
  onReset,
  busy,
  onSubmit,
  children,
}: {
  title: string;
  hint: string;
  edited?: boolean;
  onReset?: () => void;
  busy: boolean;
  onSubmit?: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <Box component={onSubmit ? "form" : "section"} onSubmit={onSubmit} noValidate sx={surfaceSx}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
          <Typography variant="h2" sx={{ flex: 1 }}>
            {title}
          </Typography>
          {edited !== undefined && (
            <Chip size="small" variant="outlined" color={edited ? "warning" : "default"} label={edited ? "Edited by admin" : "Default"} />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
        {children}
        {onSubmit && (
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" disabled={busy}>
              Save
            </Button>
            {edited && onReset && (
              <Button disabled={busy} onClick={onReset}>
                Reset to default
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function PulseForm({
  controls,
  busy,
  onSave,
  onReset,
}: {
  controls: WardControls;
  busy: boolean;
  onSave: (systems: { key: string; state: string; detail: string }[]) => Promise<boolean>;
  onReset: () => void;
}) {
  const [rows, setRows] = useState(controls.systems);
  useEffect(() => setRows(controls.systems), [controls.systems]);

  const update = (key: string, patch: { state?: string; detail?: string }) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <Panel
      title="City pulse"
      hint="The four status tiles at the top of City home."
      edited={controls.customized.includes("pulse")}
      onReset={onReset}
      busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(rows.map(({ key, state, detail }) => ({ key, state, detail: detail.trim() })));
      }}
    >
      {rows.map((row) => (
        <Stack key={row.key} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
          <Typography sx={{ fontWeight: 700, width: { sm: 76 }, flex: "0 0 auto" }}>{row.label}</Typography>
          <TextField
            select
            size="small"
            label="State"
            value={row.state}
            onChange={(event) => update(row.key, { state: event.target.value })}
            sx={{ width: { xs: "100%", sm: 130 }, flex: "0 0 auto" }}
          >
            {Object.entries(PULSE_STATE).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="What residents read"
            value={row.detail}
            onChange={(event) => update(row.key, { detail: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 60 } }}
            sx={{ flex: 1 }}
          />
        </Stack>
      ))}
    </Panel>
  );
}

function ClimateForm({
  controls,
  busy,
  onSave,
  onReset,
}: {
  controls: WardControls;
  busy: boolean;
  onSave: (body: { temperature_c: number; condition: string; humidity_pct: number; aqi: number }) => Promise<boolean>;
  onReset: () => void;
}) {
  const initial = controls.climate;
  const [temperature, setTemperature] = useState(String(initial?.temperature_c ?? ""));
  const [condition, setCondition] = useState(initial?.condition ?? "clear");
  const [humidity, setHumidity] = useState(String(initial?.humidity_pct ?? ""));
  const [aqi, setAqi] = useState(String(initial?.aqi ?? ""));
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setTemperature(String(initial?.temperature_c ?? ""));
    setCondition(initial?.condition ?? "clear");
    setHumidity(String(initial?.humidity_pct ?? ""));
    setAqi(String(initial?.aqi ?? ""));
  }, [initial]);

  const aqiValue = Number(aqi);
  const category = aqi.trim() && Number.isFinite(aqiValue) ? AQI_LABEL[aqiCategory(aqiValue)] : null;

  return (
    <Panel
      title="Climate"
      hint="Fallback when live weather cannot be fetched for this ward’s map point. Saving stamps the reading with the current time."
      edited={controls.customized.includes("climate")}
      onReset={onReset}
      busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        const body = { temperature_c: Number(temperature), condition, humidity_pct: Number(humidity), aqi: aqiValue };
        if ([temperature, humidity, aqi].some((value) => !value.trim()) || Object.values(body).some((value) => typeof value === "number" && !Number.isFinite(value))) {
          setProblem("Fill in temperature, humidity, and air quality as numbers.");
          return;
        }
        setProblem(null);
        void onSave(body);
      }}
    >
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField size="small" label="Temperature °C" type="number" value={temperature} onChange={(event) => setTemperature(event.target.value)} slotProps={{ htmlInput: { step: 0.1, min: -20, max: 55 } }} />
        <TextField select size="small" label="Sky" value={condition} onChange={(event) => setCondition(event.target.value)}>
          {Object.entries(CONDITION_LABEL).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label="Humidity %" type="number" value={humidity} onChange={(event) => setHumidity(event.target.value)} slotProps={{ htmlInput: { min: 0, max: 100 } }} />
        <TextField
          size="small"
          label="Air quality index"
          type="number"
          value={aqi}
          onChange={(event) => setAqi(event.target.value)}
          helperText={category ? `Shows as ${category}` : "0–500"}
          slotProps={{ htmlInput: { min: 0, max: 500 } }}
        />
      </Box>
      {problem && <Alert severity="error">{problem}</Alert>}
    </Panel>
  );
}

function WasteForm({
  controls,
  busy,
  onSave,
  onReset,
}: {
  controls: WardControls;
  busy: boolean;
  onSave: (body: { waste_type: string; window_label: string }) => Promise<boolean>;
  onReset: () => void;
}) {
  const [type, setType] = useState<string>(controls.waste.waste_type);
  const [slot, setSlot] = useState(controls.waste.window_label);
  useEffect(() => {
    setType(controls.waste.waste_type);
    setSlot(controls.waste.window_label);
  }, [controls.waste]);

  const paused = type === "none";

  return (
    <Panel
      title="Waste collection"
      hint="Today's pickup on City home and the Waste page. The same window applies every day until you change it."
      edited={controls.customized.includes("waste")}
      onReset={onReset}
      busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ waste_type: type, window_label: paused ? "" : slot.trim() });
      }}
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField select size="small" label="Collection" value={type} onChange={(event) => setType(event.target.value)} sx={{ minWidth: 180 }}>
          {Object.entries(WASTE_LABEL).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
          <MenuItem value="none">No collection</MenuItem>
        </TextField>
        <TextField
          size="small"
          label="Window"
          placeholder="07:00–09:00"
          value={paused ? "" : slot}
          disabled={paused}
          onChange={(event) => setSlot(event.target.value)}
          helperText={paused ? "City home says no collection today." : undefined}
          slotProps={{ htmlInput: { maxLength: 40 } }}
          sx={{ flex: 1 }}
        />
      </Stack>
    </Panel>
  );
}

function ParkingForm({
  lots,
  busy,
  onSave,
}: {
  lots: ParkingLot[];
  busy: boolean;
  onSave: (lot: ParkingLot, body: { spaces_free: number; is_open: boolean }) => Promise<boolean>;
}) {
  return (
    <Panel title="Parking" hint="Free spaces and open lots. A full or closed lot drops out of the City home count." busy={busy}>
      {lots.length === 0 && <Typography color="text.secondary">No public lots in this ward.</Typography>}
      {lots.map((lot) => (
        <ParkingRow key={lot.id} lot={lot} busy={busy} onSave={onSave} />
      ))}
    </Panel>
  );
}

function ParkingRow({
  lot,
  busy,
  onSave,
}: {
  lot: ParkingLot;
  busy: boolean;
  onSave: (lot: ParkingLot, body: { spaces_free: number; is_open: boolean }) => Promise<boolean>;
}) {
  const [free, setFree] = useState(String(lot.spaces_free));
  const [open, setOpen] = useState(lot.is_open);
  useEffect(() => {
    setFree(String(lot.spaces_free));
    setOpen(lot.is_open);
  }, [lot.spaces_free, lot.is_open]);

  const value = Number(free);
  const invalid = !free.trim() || !Number.isInteger(value) || value < 0 || value > lot.capacity;
  const changed = value !== lot.spaces_free || open !== lot.is_open;

  return (
    <Box sx={insetSurfaceSx}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{lot.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {lot.capacity} spaces · {rupees(lot.price_paise_per_hour)} / hour
          </Typography>
        </Box>
        <TextField
          size="small"
          label="Free"
          type="number"
          value={free}
          onChange={(event) => setFree(event.target.value)}
          error={invalid}
          helperText={invalid ? `0–${lot.capacity}` : undefined}
          slotProps={{ htmlInput: { min: 0, max: lot.capacity } }}
          sx={{ width: { xs: "100%", sm: 96 } }}
        />
        <Stack direction="row" sx={{ alignItems: "center" }}>
          <Typography variant="body2" sx={{ minWidth: 48 }}>
            {open ? "Open" : "Closed"}
          </Typography>
          <Switch checked={open} onChange={(event) => setOpen(event.target.checked)} slotProps={{ input: { "aria-label": `${lot.name} open` } }} />
        </Stack>
        <Button variant="outlined" disabled={busy || invalid || !changed} onClick={() => void onSave(lot, { spaces_free: value, is_open: open })}>
          Save
        </Button>
      </Stack>
    </Box>
  );
}
