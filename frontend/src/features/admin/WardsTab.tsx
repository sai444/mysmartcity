import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { apiGet, apiRequest, errorMessage, fieldErrors } from "../../api/client";
import type { AdminWard, Facility, ParkingLot } from "../../api/types";
import { insetSurfaceSx, linkSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { LiveWeather } from "../city/LiveWeather";
import { KIND_LABEL, rupees } from "../city/labels";
import { useWard } from "../city/WardContext";
import { PlaceMap } from "../map/PlaceMap";

type Point = { latitude: number; longitude: number };
type Errors = Record<string, string>;

export function WardsTab() {
  const { reload: reloadPublic } = useWard();
  const [wards, setWards] = useState<AdminWard[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [lots, setLots] = useState<ParkingLot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wardDialog, setWardDialog] = useState<AdminWard | "new" | null>(null);
  const [facilityDialog, setFacilityDialog] = useState<Facility | "new" | null>(null);
  const [lotDialog, setLotDialog] = useState<ParkingLot | "new" | null>(null);

  const loadWards = useCallback(async () => {
    const payload = await apiGet<{ data: AdminWard[] }>("/api/v1/admin/wards");
    setWards(payload.data);
    setSelectedId((current) => (payload.data.some((ward) => ward.id === current) ? current : (payload.data[0]?.id ?? "")));
  }, []);

  const loadPlaces = useCallback(async (wardId: string) => {
    const query = `?ward_id=${encodeURIComponent(wardId)}`;
    const [places, parking] = await Promise.all([
      apiGet<{ data: Facility[] }>(`/api/v1/admin/facilities${query}`),
      apiGet<{ data: ParkingLot[] }>(`/api/v1/admin/parking${query}`),
    ]);
    setFacilities(places.data);
    setLots(parking.data);
  }, []);

  useEffect(() => {
    loadWards().catch((reason: unknown) => setError(errorMessage(reason)));
  }, [loadWards]);

  useEffect(() => {
    if (!selectedId) return;
    setFacilities(null);
    setLots(null);
    loadPlaces(selectedId).catch((reason: unknown) => setError(errorMessage(reason)));
  }, [selectedId, loadPlaces]);

  const refresh = async (message: string, wardId = selectedId) => {
    setNotice(message);
    setError(null);
    await loadWards();
    if (wardId) await loadPlaces(wardId);
    reloadPublic();
  };

  const act = async (run: () => Promise<unknown>, message: string) => {
    setNotice(null);
    setError(null);
    try {
      await run();
      await refresh(message);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  if (!wards) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading wards" />;
  const ward = wards.find((item) => item.id === selectedId) ?? null;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <Typography color="text.secondary" sx={{ flex: 1 }}>
          Add wards, rename them, set where the map opens, and manage each ward's public places and parking. Hidden wards
          disappear from every ward picker but keep their data.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWardDialog("new")} sx={{ flex: "0 0 auto" }}>
          Add ward
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" } }}>
        {wards.map((item) => (
          <Box
            key={item.id}
            component="button"
            type="button"
            aria-pressed={item.id === selectedId}
            onClick={() => setSelectedId(item.id)}
            sx={[
              linkSurfaceSx,
              {
                textAlign: "left",
                font: "inherit",
                cursor: "pointer",
                borderWidth: 2,
                borderColor: item.id === selectedId ? "primary.main" : "divider",
                opacity: item.active ? 1 : 0.7,
              },
            ]}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700, flex: 1 }}>{item.name}</Typography>
              <Chip size="small" label={item.code} variant="outlined" />
              {!item.active && <Chip size="small" label="Hidden" color="warning" variant="outlined" />}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {item.facility_count} places · {item.parking_count} parking lots
            </Typography>
          </Box>
        ))}
      </Box>

      {ward && (
        <Box sx={surfaceSx}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h2">{ward.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Code {ward.code} · map centre {ward.latitude.toFixed(4)}, {ward.longitude.toFixed(4)} ·{" "}
                  {ward.active ? "Open to residents" : "Hidden from residents"}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <Button variant="outlined" onClick={() => setWardDialog(ward)}>
                  Edit
                </Button>
                <Button
                  variant="outlined"
                  color={ward.active ? "warning" : "success"}
                  onClick={() =>
                    void act(
                      () => apiRequest(`/api/v1/admin/wards/${ward.id}`, { method: "PATCH", body: { active: !ward.active } }),
                      ward.active ? `${ward.name} is hidden from residents.` : `${ward.name} is open to residents.`,
                    )
                  }
                >
                  {ward.active ? "Hide" : "Open"}
                </Button>
                <Button
                  color="error"
                  onClick={() => {
                    if (!window.confirm(`Remove ${ward.name}? Only empty wards can be removed.`)) return;
                    void act(() => apiRequest(`/api/v1/admin/wards/${ward.id}`, { method: "DELETE" }), `${ward.name} removed.`);
                  }}
                >
                  Remove
                </Button>
              </Stack>
            </Stack>

            <Section title="Public places" hint="Clinics, parks, toilets, EV chargers, and ward offices." onAdd={() => setFacilityDialog("new")}>
              {!facilities && <CircularProgress size={24} aria-label="Loading places" />}
              {facilities?.length === 0 && <Typography color="text.secondary">No places yet.</Typography>}
              {facilities?.map((place) => (
                <Row
                  key={place.id}
                  title={place.name}
                  meta={`${KIND_LABEL[place.kind] ?? place.kind} · ${place.address_text} · ${place.opening_hours}${place.phone ? ` · ${place.phone}` : ""}`}
                  onEdit={() => setFacilityDialog(place)}
                  onDelete={() => {
                    if (!window.confirm(`Remove ${place.name}?`)) return;
                    void act(() => apiRequest(`/api/v1/admin/facilities/${place.id}`, { method: "DELETE" }), `${place.name} removed.`);
                  }}
                />
              ))}
            </Section>

            <Section title="Parking lots" hint="Capacity and price. Free spaces can also be updated on the City home tab." onAdd={() => setLotDialog("new")}>
              {!lots && <CircularProgress size={24} aria-label="Loading parking" />}
              {lots?.length === 0 && <Typography color="text.secondary">No parking lots yet.</Typography>}
              {lots?.map((lot) => (
                <Row
                  key={lot.id}
                  title={lot.name}
                  meta={`${lot.spaces_free}/${lot.capacity} free · ${rupees(lot.price_paise_per_hour)} / hour · ${lot.is_open ? "Open" : "Closed"}`}
                  onEdit={() => setLotDialog(lot)}
                  onDelete={() => {
                    if (!window.confirm(`Remove ${lot.name}?`)) return;
                    void act(() => apiRequest(`/api/v1/admin/parking/${lot.id}`, { method: "DELETE" }), `${lot.name} removed.`);
                  }}
                />
              ))}
            </Section>
          </Stack>
        </Box>
      )}

      {wardDialog && (
        <WardDialog
          ward={wardDialog === "new" ? null : wardDialog}
          fallback={ward ?? wards[0] ?? null}
          onClose={() => setWardDialog(null)}
          onSaved={(saved, created) => {
            setWardDialog(null);
            if (created) setSelectedId(saved.id);
            void refresh(created ? `${saved.name} added. Residents can pick it now.` : `${saved.name} saved.`, saved.id);
          }}
        />
      )}
      {facilityDialog && ward && (
        <FacilityDialog
          ward={ward}
          place={facilityDialog === "new" ? null : facilityDialog}
          onClose={() => setFacilityDialog(null)}
          onSaved={(saved) => {
            setFacilityDialog(null);
            void refresh(`${saved.name} saved.`);
          }}
        />
      )}
      {lotDialog && ward && (
        <LotDialog
          ward={ward}
          lot={lotDialog === "new" ? null : lotDialog}
          onClose={() => setLotDialog(null)}
          onSaved={(saved) => {
            setLotDialog(null);
            void refresh(`${saved.name} saved.`);
          }}
        />
      )}
    </Stack>
  );
}

function Section({ title, hint, onAdd, children }: { title: string; hint: string; onAdd: () => void; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h3">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
        </Box>
        <Button size="small" startIcon={<AddIcon />} onClick={onAdd}>
          Add
        </Button>
      </Stack>
      {children}
    </Stack>
  );
}

function Row({ title, meta, onEdit, onDelete }: { title: string; meta: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <Box sx={insetSurfaceSx}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {meta}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={onEdit}>
            Edit
          </Button>
          <Button size="small" color="error" onClick={onDelete}>
            Remove
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function PointPicker({ point, label, onPick }: { point: Point; label: string; onPick: (point: Point) => void }) {
  return (
    <Stack spacing={0.75}>
      <Typography variant="body2" color="text.secondary">
        Click the map to place it. {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
      </Typography>
      <PlaceMap
        center={point}
        zoom={15}
        height={240}
        pins={[{ id: "pick", name: label || "Here", latitude: point.latitude, longitude: point.longitude, color: "#0f766e", label: "Selected point" }]}
        onPick={(latitude, longitude) => onPick({ latitude, longitude })}
      />
      <LiveWeather latitude={point.latitude} longitude={point.longitude} compact />
    </Stack>
  );
}

function FormDialog({
  title,
  busy,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <Box
        component="form"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.75} sx={{ pt: 1 }}>
          {children}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
      </Box>
    </Dialog>
  );
}

function useSubmit<T>(onSaved: (saved: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const submit = async (run: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      onSaved(await run());
    } catch (reason) {
      setErrors(fieldErrors(reason));
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, errors, submit };
}

function WardDialog({
  ward,
  fallback,
  onClose,
  onSaved,
}: {
  ward: AdminWard | null;
  fallback: Point | null;
  onClose: () => void;
  onSaved: (ward: AdminWard, created: boolean) => void;
}) {
  const [name, setName] = useState(ward?.name ?? "");
  const [code, setCode] = useState(ward?.code ?? "");
  const [point, setPoint] = useState<Point>(ward ?? fallback ?? { latitude: 12.9716, longitude: 77.5946 });
  const { busy, error, errors, submit } = useSubmit<AdminWard>((saved) => onSaved(saved, !ward));

  return (
    <FormDialog
      title={ward ? `Edit ${ward.name}` : "Add a ward"}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        void submit(() =>
          apiRequest<AdminWard>(ward ? `/api/v1/admin/wards/${ward.id}` : "/api/v1/admin/wards", {
            method: ward ? "PATCH" : "POST",
            body: { name: name.trim(), code: code.trim(), latitude: point.latitude, longitude: point.longitude },
          }),
        )
      }
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="Ward name" value={name} onChange={(event) => setName(event.target.value)} error={Boolean(errors.name)} helperText={errors.name} required fullWidth autoFocus />
        <TextField
          label="Code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          error={Boolean(errors.code)}
          helperText={errors.code || "Like W04"}
          required
          sx={{ width: { sm: 140 } }}
          slotProps={{ htmlInput: { maxLength: 10 } }}
        />
      </Stack>
      <PointPicker point={point} label={name} onPick={setPoint} />
    </FormDialog>
  );
}

function FacilityDialog({
  ward,
  place,
  onClose,
  onSaved,
}: {
  ward: AdminWard;
  place: Facility | null;
  onClose: () => void;
  onSaved: (place: Facility) => void;
}) {
  const [kind, setKind] = useState(place?.kind ?? "clinic");
  const [name, setName] = useState(place?.name ?? "");
  const [address, setAddress] = useState(place?.address_text ?? "");
  const [hours, setHours] = useState(place?.opening_hours ?? "9:00–18:00");
  const [phone, setPhone] = useState(place?.phone ?? "");
  const [point, setPoint] = useState<Point>(place ?? ward);
  const { busy, error, errors, submit } = useSubmit<Facility>(onSaved);

  return (
    <FormDialog
      title={place ? `Edit ${place.name}` : `Add a place in ${ward.name}`}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        void submit(() =>
          apiRequest<Facility>(place ? `/api/v1/admin/facilities/${place.id}` : "/api/v1/admin/facilities", {
            method: place ? "PUT" : "POST",
            body: { ward_id: ward.id, kind, name, address_text: address, opening_hours: hours, phone, ...point },
          }),
        )
      }
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField select label="Type" value={kind} onChange={(event) => setKind(event.target.value)} sx={{ minWidth: 180 }}>
          {Object.entries(KIND_LABEL).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} error={Boolean(errors.name)} helperText={errors.name} required fullWidth autoFocus />
      </Stack>
      <TextField label="Address" value={address} onChange={(event) => setAddress(event.target.value)} error={Boolean(errors.address_text)} helperText={errors.address_text} required />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="Opening hours" value={hours} onChange={(event) => setHours(event.target.value)} error={Boolean(errors.opening_hours)} helperText={errors.opening_hours} required fullWidth />
        <TextField label="Phone (optional)" value={phone} onChange={(event) => setPhone(event.target.value)} error={Boolean(errors.phone)} helperText={errors.phone} fullWidth />
      </Stack>
      <PointPicker point={point} label={name} onPick={setPoint} />
    </FormDialog>
  );
}

function LotDialog({
  ward,
  lot,
  onClose,
  onSaved,
}: {
  ward: AdminWard;
  lot: ParkingLot | null;
  onClose: () => void;
  onSaved: (lot: ParkingLot) => void;
}) {
  const [name, setName] = useState(lot?.name ?? "");
  const [address, setAddress] = useState(lot?.address_text ?? "");
  const [capacity, setCapacity] = useState(String(lot?.capacity ?? 20));
  const [free, setFree] = useState(String(lot?.spaces_free ?? 20));
  const [price, setPrice] = useState(String((lot?.price_paise_per_hour ?? 2000) / 100));
  const [open, setOpen] = useState(lot?.is_open ?? true);
  const [point, setPoint] = useState<Point>(lot ?? ward);
  const { busy, error, errors, submit } = useSubmit<ParkingLot>(onSaved);

  return (
    <FormDialog
      title={lot ? `Edit ${lot.name}` : `Add parking in ${ward.name}`}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        void submit(() =>
          apiRequest<ParkingLot>(lot ? `/api/v1/admin/parking/${lot.id}` : "/api/v1/admin/parking", {
            method: lot ? "PUT" : "POST",
            body: {
              ward_id: ward.id,
              name,
              address_text: address,
              capacity: Number(capacity),
              spaces_free: Number(free),
              price_paise_per_hour: Math.round(Number(price) * 100),
              is_open: open,
              ...point,
            },
          }),
        )
      }
    >
      <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} error={Boolean(errors.name)} helperText={errors.name} required autoFocus />
      <TextField label="Address" value={address} onChange={(event) => setAddress(event.target.value)} error={Boolean(errors.address_text)} helperText={errors.address_text} required />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="Capacity" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} error={Boolean(errors.capacity)} helperText={errors.capacity} fullWidth slotProps={{ htmlInput: { min: 1 } }} />
        <TextField label="Free now" type="number" value={free} onChange={(event) => setFree(event.target.value)} error={Boolean(errors.spaces_free)} helperText={errors.spaces_free} fullWidth slotProps={{ htmlInput: { min: 0 } }} />
        <TextField label="₹ per hour" type="number" value={price} onChange={(event) => setPrice(event.target.value)} error={Boolean(errors.price_paise_per_hour)} helperText={errors.price_paise_per_hour} fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} />
      </Stack>
      <FormControlLabel control={<Switch checked={open} onChange={(event) => setOpen(event.target.checked)} />} label={open ? "Open" : "Closed"} />
      <PointPicker point={point} label={name} onPick={setPoint} />
    </FormDialog>
  );
}
