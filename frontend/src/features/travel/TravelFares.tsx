import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { apiGet, apiRequest, errorMessage } from "../../api/client";
import type { ChargeKind, ChargeType, FareBook, FareCharge, FareRule } from "../../api/types";
import { rupees } from "../city/labels";
import { Surface } from "../life/ui";
import { kindLabel, VEHICLE_KINDS } from "./kinds";

const CHARGE_TYPES: { id: ChargeType; label: string }[] = [
  { id: "fixed", label: "Fixed ₹" },
  { id: "per_km", label: "₹ per km" },
  { id: "percent", label: "Percent of fare" },
];

const CHARGE_KINDS: { id: ChargeKind; label: string }[] = [{ id: "all", label: "Every vehicle" }, ...VEHICLE_KINDS];

export function FareDesk() {
  const [book, setBook] = useState<FareBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<FareBook>("/api/v1/transit/fares")
      .then((payload) => {
        if (active) setBook(payload);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  if (!book) {
    return error ? <Alert severity="error">{error}</Alert> : null;
  }

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h2">Fare rules</Typography>
        <Typography color="text.secondary">
          Residents pick pickup and drop on the map. Distance is measured in kilometres, then these rules and extra
          charges set the price.
        </Typography>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {book.rules.map((rule) => (
        <RuleEditor
          key={rule.kind}
          rule={rule}
          onSaved={(next) => setBook({ ...book, rules: book.rules.map((item) => (item.kind === next.kind ? next : item)) })}
        />
      ))}
      <ChargesEditor
        charges={book.charges}
        onChange={(charges) => setBook({ ...book, charges })}
        onError={setError}
      />
    </Stack>
  );
}

function RuleEditor({ rule, onSaved }: { rule: FareRule; onSaved: (rule: FareRule) => void }) {
  const [draft, setDraft] = useState(() => fromRule(rule));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const body = toRule(draft);
    if (typeof body === "string") {
      setError(body);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<FareRule>(`/api/v1/transit/fares/${rule.kind}`, { method: "PATCH", body });
      setDraft(fromRule(next));
      onSaved(next);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<RuleDraft>) => setDraft({ ...draft, ...patch });

  return (
    <Surface>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }}>
          {kindLabel(rule.kind)} · {rupees(rule.base_paise)} + {rupees(rule.per_km_paise)}/km
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField label="Base ₹" value={draft.base} onChange={(event) => set({ base: event.target.value })} required />
          <TextField label="Included km" value={draft.includedKm} onChange={(event) => set({ includedKm: event.target.value })} required />
          <TextField label="₹ per km" value={draft.perKm} onChange={(event) => set({ perKm: event.target.value })} required />
          <TextField label="₹ per minute" value={draft.perMinute} onChange={(event) => set({ perMinute: event.target.value })} helperText="0 to skip" />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField label="Minimum ₹" value={draft.min} onChange={(event) => set({ min: event.target.value })} required />
          <TextField label="Night %" value={draft.nightPct} onChange={(event) => set({ nightPct: event.target.value })} />
          <TextField label="Night from" value={draft.nightStart} onChange={(event) => set({ nightStart: event.target.value })} helperText="HH:MM" />
          <TextField label="Night to" value={draft.nightEnd} onChange={(event) => set({ nightEnd: event.target.value })} helperText="HH:MM" />
          <TextField label="Speed km/h" value={draft.speed} onChange={(event) => set({ speed: event.target.value })} helperText="For time estimate" />
        </Stack>
        <FormControlLabel
          control={<Checkbox checked={draft.perSeat} onChange={(event) => set({ perSeat: event.target.checked })} />}
          label="Multiply fare by seats (bus and metro)"
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" disabled={busy} onClick={() => void save()} sx={{ alignSelf: "flex-start" }}>
          {busy ? "Saving…" : "Save fare"}
        </Button>
      </Stack>
    </Surface>
  );
}

type RuleDraft = {
  base: string;
  includedKm: string;
  perKm: string;
  perMinute: string;
  min: string;
  nightPct: string;
  nightStart: string;
  nightEnd: string;
  perSeat: boolean;
  speed: string;
};

function fromRule(rule: FareRule): RuleDraft {
  return {
    base: rupeeField(rule.base_paise),
    includedKm: String(rule.included_km),
    perKm: rupeeField(rule.per_km_paise),
    perMinute: rupeeField(rule.per_minute_paise),
    min: rupeeField(rule.min_paise),
    nightPct: String(rule.night_surcharge_pct),
    nightStart: rule.night_start,
    nightEnd: rule.night_end,
    perSeat: rule.per_seat,
    speed: String(rule.speed_kmh),
  };
}

function toRule(draft: RuleDraft) {
  const base = rupeesToPaise(draft.base);
  const perKm = rupeesToPaise(draft.perKm);
  const perMinute = rupeesToPaise(draft.perMinute);
  const min = rupeesToPaise(draft.min);
  const includedKm = Number(draft.includedKm);
  const nightPct = Number(draft.nightPct);
  const speed = Number(draft.speed);
  if (base === null || perKm === null || perMinute === null || min === null) return "Enter fares in rupees.";
  if (!Number.isFinite(includedKm) || includedKm < 0) return "Enter included kilometres.";
  if (!Number.isInteger(nightPct) || nightPct < 0 || nightPct > 100) return "Night surcharge is 0 to 100 percent.";
  if (!Number.isInteger(speed) || speed < 4) return "Enter a typical speed in km/h.";
  if (!/^\d{2}:\d{2}$/.test(draft.nightStart) || !/^\d{2}:\d{2}$/.test(draft.nightEnd)) return "Night hours look like 22:00.";
  return {
    base_paise: base,
    included_km: includedKm,
    per_km_paise: perKm,
    per_minute_paise: perMinute,
    min_paise: min,
    night_surcharge_pct: nightPct,
    night_start: draft.nightStart,
    night_end: draft.nightEnd,
    per_seat: draft.perSeat,
    speed_kmh: speed,
  };
}

function ChargesEditor({
  charges,
  onChange,
  onError,
}: {
  charges: FareCharge[];
  onChange: (charges: FareCharge[]) => void;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState(blankCharge);
  const [busy, setBusy] = useState(false);

  async function add() {
    const body = toCharge(draft);
    if (typeof body === "string") {
      onError(body);
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const created = await apiRequest<FareCharge>("/api/v1/transit/fares/charges", { method: "POST", body });
      onChange([...charges, created]);
      setDraft(blankCharge());
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }}>Extra charges</Typography>
        <Typography color="text.secondary">
          Add a booking fee, toll, peak-hour percent, or any other line the city wants on the quote.
        </Typography>
        {charges.map((charge) => (
          <ChargeRow
            key={charge.id}
            charge={charge}
            onSaved={(next) => onChange(charges.map((item) => (item.id === next.id ? next : item)))}
            onRemoved={() => onChange(charges.filter((item) => item.id !== charge.id))}
            onError={onError}
          />
        ))}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
          <TextField label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} sx={{ flex: 1 }} />
          <TextField select label="Applies to" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ChargeKind })} sx={{ minWidth: { sm: 160 } }}>
            {CHARGE_KINDS.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Type" value={draft.chargeType} onChange={(event) => setDraft({ ...draft, chargeType: event.target.value as ChargeType })} sx={{ minWidth: { sm: 160 } }}>
            {CHARGE_TYPES.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={draft.chargeType === "percent" ? "%" : "₹"}
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            sx={{ width: { sm: 110 } }}
          />
        </Stack>
        <Button variant="contained" disabled={busy} onClick={() => void add()} sx={{ alignSelf: "flex-start" }}>
          {busy ? "Saving…" : "Add charge"}
        </Button>
      </Stack>
    </Surface>
  );
}

function ChargeRow({
  charge,
  onSaved,
  onRemoved,
  onError,
}: {
  charge: FareCharge;
  onSaved: (charge: FareCharge) => void;
  onRemoved: () => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    onError(null);
    try {
      const next = await apiRequest<FareCharge>(`/api/v1/transit/fares/charges/${charge.id}`, {
        method: "PATCH",
        body: { kind: charge.kind, name: charge.name, amount: charge.amount, charge_type: charge.charge_type, is_active: !charge.is_active },
      });
      onSaved(next);
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${charge.name}?`)) return;
    setBusy(true);
    onError(null);
    try {
      await apiRequest<void>(`/api/v1/transit/fares/charges/${charge.id}`, { method: "DELETE" });
      onRemoved();
    } catch (reason) {
      onError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
      <Typography>
        {charge.name} · {chargeLabel(charge)} · {charge.kind === "all" ? "every vehicle" : kindLabel(charge.kind)}
        {charge.is_active ? "" : " · off"}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button size="small" disabled={busy} onClick={() => void toggle()}>
          {charge.is_active ? "Turn off" : "Turn on"}
        </Button>
        <Button size="small" color="error" disabled={busy} onClick={() => void remove()}>
          Remove
        </Button>
      </Stack>
    </Stack>
  );
}

type ChargeDraft = {
  name: string;
  kind: ChargeKind;
  chargeType: ChargeType;
  amount: string;
};

function blankCharge(): ChargeDraft {
  return { name: "", kind: "all", chargeType: "fixed", amount: "" };
}

function toCharge(draft: ChargeDraft) {
  if (!draft.name.trim()) return "Name the charge.";
  if (draft.chargeType === "percent") {
    const percent = Number(draft.amount);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) return "Percent is 0 to 100.";
    return { kind: draft.kind, name: draft.name.trim(), amount: percent, charge_type: draft.chargeType, is_active: true };
  }
  const paise = rupeesToPaise(draft.amount);
  if (paise === null) return "Enter the charge in rupees.";
  return { kind: draft.kind, name: draft.name.trim(), amount: paise, charge_type: draft.chargeType, is_active: true };
}

function chargeLabel(charge: FareCharge) {
  if (charge.charge_type === "percent") return `${charge.amount}%`;
  if (charge.charge_type === "per_km") return `${rupees(charge.amount)}/km`;
  return rupees(charge.amount);
}

function rupeeField(paise: number) {
  const value = paise / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function rupeesToPaise(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}
