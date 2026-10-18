import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import { apiRequest, errorMessage, fieldErrors } from "../../api/client";
import type { Vehicle, VehicleKind } from "../../api/types";
import { rupees } from "../city/labels";
import { Surface } from "../life/ui";
import { draftsFrom, hasCoverImage, mediaIds, type MediaDraft } from "../media/api";
import { MediaManager } from "../media/MediaManager";
import { kindLabel, VEHICLE_KINDS } from "./kinds";
import { FareDesk } from "./TravelFares";

const MAX_MEDIA = 8;

export { kindLabel, VEHICLE_KINDS };

type Draft = {
  name: string;
  kind: VehicleKind;
  registration: string;
  origin: string;
  destination: string;
  price: string;
  seats: string;
  phone: string;
  contact_name: string;
  minutes: string;
  departures: string;
  notes: string;
  is_active: boolean;
  media: MediaDraft[];
};

function blankDraft(): Draft {
  return {
    name: "",
    kind: "bus",
    registration: "",
    origin: "Gandhi Nagar",
    destination: "Lake View",
    price: "",
    seats: "12",
    phone: "",
    contact_name: "",
    minutes: "20",
    departures: "08:00, 18:00",
    notes: "",
    is_active: true,
    media: [],
  };
}

function fromVehicle(vehicle: Vehicle): Draft {
  return {
    name: vehicle.name,
    kind: (VEHICLE_KINDS.some((item) => item.id === vehicle.kind) ? vehicle.kind : "bus") as VehicleKind,
    registration: vehicle.registration,
    origin: vehicle.origin,
    destination: vehicle.destination,
    price: String(vehicle.price_paise / 100),
    seats: String(vehicle.seats),
    phone: vehicle.phone,
    contact_name: vehicle.contact_name,
    minutes: String(vehicle.minutes),
    departures: vehicle.departures,
    notes: vehicle.notes,
    is_active: vehicle.is_active,
    media: draftsFrom(vehicle.media),
  };
}

export function TravelDesk({
  vehicles,
  onChange,
}: {
  vehicles: Vehicle[];
  onChange: (vehicles: Vehicle[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function create() {
    const body = toBody(draft);
    if (typeof body === "string") {
      setError(body);
      return;
    }
    setBusy(true);
    setError(null);
    setFieldError({});
    try {
      const created = await apiRequest<Vehicle>("/api/v1/transit/vehicles", { method: "POST", body });
      onChange([created, ...vehicles]);
      setDraft(blankDraft());
    } catch (reason) {
      setFieldError(fieldErrors(reason));
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <FareDesk />
      <Typography variant="h2">Vehicle desk</Typography>
      <Typography color="text.secondary">
        Add a vehicle, set its fare and contact number, or take one off the public list.
      </Typography>
      {vehicles.map((vehicle) => (
        <VehicleEditor
          key={vehicle.id}
          vehicle={vehicle}
          onSaved={(next) => onChange(vehicles.map((item) => (item.id === next.id ? next : item)))}
          onRemoved={() => onChange(vehicles.filter((item) => item.id !== vehicle.id))}
        />
      ))}
      <Surface>
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 700 }}>Add a vehicle</Typography>
          <VehicleFields draft={draft} onChange={setDraft} errors={fieldError} onError={setError} onBusyChange={setUploading} />
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="contained" disabled={busy || uploading} onClick={() => void create()} sx={{ alignSelf: "flex-start" }}>
            {uploading ? "Uploading…" : busy ? "Saving…" : "Add vehicle"}
          </Button>
        </Stack>
      </Surface>
    </Stack>
  );
}

function VehicleEditor({
  vehicle,
  onSaved,
  onRemoved,
}: {
  vehicle: Vehicle;
  onSaved: (vehicle: Vehicle) => void;
  onRemoved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromVehicle(vehicle));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function save() {
    const body = toBody(draft);
    if (typeof body === "string") {
      setError(body);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<Vehicle>(`/api/v1/transit/vehicles/${vehicle.id}`, { method: "PATCH", body });
      onSaved(next);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${vehicle.name} from local transit?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest<void>(`/api/v1/transit/vehicles/${vehicle.id}`, { method: "DELETE" });
      onRemoved();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <Surface>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }}>
          {vehicle.name} · {rupees(vehicle.price_paise)} · {vehicle.phone}
        </Typography>
        <VehicleFields draft={draft} onChange={setDraft} errors={{}} onError={setError} onBusyChange={setUploading} />
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={busy || uploading} onClick={() => void save()}>
            {uploading ? "Uploading…" : "Save"}
          </Button>
          <Button color="error" disabled={busy} onClick={() => void remove()}>
            Remove vehicle
          </Button>
        </Stack>
      </Stack>
    </Surface>
  );
}

function VehicleFields({
  draft,
  onChange,
  errors,
  onError,
  onBusyChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  errors: Record<string, string>;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="Name" value={draft.name} onChange={(event) => set({ name: event.target.value })} error={Boolean(errors.name)} helperText={errors.name} fullWidth required />
        <TextField select label="Kind" value={draft.kind} onChange={(event) => set({ kind: event.target.value as VehicleKind })} sx={{ minWidth: { sm: 160 } }}>
          {VEHICLE_KINDS.map((kind) => (
            <MenuItem key={kind.id} value={kind.id}>
              {kind.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Registration" value={draft.registration} onChange={(event) => set({ registration: event.target.value })} fullWidth required />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="From" value={draft.origin} onChange={(event) => set({ origin: event.target.value })} error={Boolean(errors.origin)} helperText={errors.origin} fullWidth required />
        <TextField label="To" value={draft.destination} onChange={(event) => set({ destination: event.target.value })} error={Boolean(errors.destination)} helperText={errors.destination} fullWidth required />
        <TextField label="Fare ₹" value={draft.price} onChange={(event) => set({ price: event.target.value })} sx={{ minWidth: { sm: 120 } }} required />
        <TextField label="Seats" value={draft.seats} onChange={(event) => set({ seats: event.target.value })} sx={{ minWidth: { sm: 100 } }} required />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="Contact number" value={draft.phone} onChange={(event) => set({ phone: event.target.value })} fullWidth required />
        <TextField label="Contact name" value={draft.contact_name} onChange={(event) => set({ contact_name: event.target.value })} fullWidth required />
        <TextField label="Minutes" value={draft.minutes} onChange={(event) => set({ minutes: event.target.value })} sx={{ minWidth: { sm: 110 } }} required />
      </Stack>
      <TextField label="Departures" value={draft.departures} onChange={(event) => set({ departures: event.target.value })} helperText="Times separated by commas, or On call." fullWidth required />
      <TextField label="Notes" value={draft.notes} onChange={(event) => set({ notes: event.target.value })} fullWidth multiline minRows={2} />
      <FormControlLabel
        control={<Checkbox checked={draft.is_active} onChange={(event) => set({ is_active: event.target.checked })} />}
        label="Shown to residents"
      />
      <MediaManager
        value={draft.media}
        onChange={(media) => onChange({ ...draft, media })}
        onError={onError}
        onBusyChange={onBusyChange}
        max={MAX_MEDIA}
        hint={`Required. Up to ${MAX_MEDIA}. Show the vehicle outside and inside so riders can spot it. The first photo is the cover.`}
        required
      />
    </Stack>
  );
}

function toBody(draft: Draft) {
  const price = Number(draft.price);
  const seats = Number(draft.seats);
  const minutes = Number(draft.minutes);
  if (!draft.name.trim() || !draft.registration.trim() || !draft.phone.trim() || !draft.contact_name.trim()) {
    return "Name, registration, contact number, and contact name are required.";
  }
  if (!Number.isFinite(price) || price < 0) return "Enter the fare in rupees.";
  if (!Number.isInteger(seats) || seats < 1) return "Enter the number of seats.";
  if (!Number.isInteger(minutes) || minutes < 1) return "Enter the trip time in minutes.";
  if (draft.origin === draft.destination) return "Pick two different places.";
  if (!hasCoverImage(draft.media)) return "Add at least one photo of the vehicle.";
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    registration: draft.registration.trim(),
    origin: draft.origin,
    destination: draft.destination,
    price_paise: Math.round(price * 100),
    seats,
    phone: draft.phone.trim(),
    contact_name: draft.contact_name.trim(),
    minutes,
    departures: draft.departures.trim(),
    notes: draft.notes.trim(),
    is_active: draft.is_active,
    media: mediaIds(draft.media),
  };
}
