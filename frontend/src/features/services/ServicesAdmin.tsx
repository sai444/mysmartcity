import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet, apiRequest, errorMessage } from "../../api/client";
import type { LocalService, ServiceCategory, ServiceListingStatus, ServiceSubcategory } from "../../api/types";
import { insetSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { listingPrice, SERVICE_STATUS, slaLine } from "./labels";

const REVIEW: Record<ServiceListingStatus, { status: "approved" | "rejected" | "disabled"; label: string; ask?: string }[]> = {
  pending: [
    { status: "approved", label: "Approve" },
    { status: "rejected", label: "Reject", ask: "Why is this listing rejected? The provider sees this note." },
  ],
  approved: [{ status: "disabled", label: "Take down", ask: "Why is this listing coming down?" }],
  rejected: [{ status: "approved", label: "Approve" }],
  disabled: [{ status: "approved", label: "Restore" }],
};

export function ServicesTab() {
  const [rows, setRows] = useState<LocalService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ServiceListingStatus | "all">("pending");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: LocalService[] }>("/api/v1/services/manage")
      .then((payload) => {
        setRows(payload.data);
        if (!payload.data.some((row) => row.status === "pending")) setStatus("all");
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows?.filter(
        (row) =>
          (status === "all" || row.status === status) &&
          (!needle ||
            row.title.toLowerCase().includes(needle) ||
            row.provider_name.toLowerCase().includes(needle) ||
            row.category_name.toLowerCase().includes(needle) ||
            row.subcategory_name.toLowerCase().includes(needle)),
      ) ?? null,
    [rows, status, needle],
  );

  async function move(listing: LocalService, step: (typeof REVIEW)[ServiceListingStatus][number]) {
    let note: string | null = null;
    if (step.ask) {
      const answer = window.prompt(step.ask, "");
      if (answer === null) return;
      note = answer;
    }
    setBusy(listing.id);
    setError(null);
    try {
      const next = await apiRequest<LocalService>(`/api/v1/services/${listing.id}/status`, {
        method: "POST",
        body: { status: step.status, note },
      });
      setRows((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading services" />;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <TextField label="Search title, provider, or type" value={query} onChange={(event) => setQuery(event.target.value)} size="small" sx={{ flex: 1, maxWidth: 360 }} />
        <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as ServiceListingStatus | "all")} size="small" sx={{ minWidth: 220 }}>
          <MenuItem value="all">All services ({rows.length})</MenuItem>
          {(Object.keys(SERVICE_STATUS) as ServiceListingStatus[]).map((key) => (
            <MenuItem key={key} value={key}>
              {SERVICE_STATUS[key].label} ({rows.filter((row) => row.status === key).length})
            </MenuItem>
          ))}
        </TextField>
        <Button component={RouterLink} to="/services/offer" variant="contained" sx={{ flex: "0 0 auto" }}>
          List a service
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {filtered?.length === 0 && (
        <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
          <Typography color="text.secondary">No services in this view. Providers send listings here for approval.</Typography>
        </Box>
      )}
      {filtered?.map((row) => {
        const chip = SERVICE_STATUS[row.status];
        return (
          <Box key={row.id} sx={surfaceSx}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{row.title}</Typography>
                  <Chip label={chip.label} color={chip.color} size="small" variant={row.status === "approved" ? "filled" : "outlined"} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {row.category_name} · {row.subcategory_name} · {listingPrice(row.price_paise)} · {row.ward_name}
                </Typography>
                <Typography variant="body2">{row.details}</Typography>
                <Typography variant="body2">
                  {row.provider_name} · {row.contact_name} · {row.contact_phone} · {row.area_text}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  SLA: {slaLine(row.sla)}
                </Typography>
                {row.review_note && (
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Note: {row.review_note}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1} sx={{ flex: "0 0 auto" }}>
                {REVIEW[row.status].map((step) => (
                  <Button
                    key={step.status}
                    variant={step.status === "approved" ? "contained" : "outlined"}
                    color={step.status === "approved" ? "success" : "error"}
                    disabled={busy === row.id}
                    onClick={() => void move(row, step)}
                  >
                    {step.label}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

export function ServiceTypesTab() {
  const [categories, setCategories] = useState<ServiceCategory[] | null>(null);
  const [subs, setSubs] = useState<ServiceSubcategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    Promise.all([
      apiGet<{ data: ServiceCategory[] }>("/api/v1/services/categories"),
      apiGet<{ data: ServiceSubcategory[] }>("/api/v1/services/subcategories"),
    ])
      .then(([cats, types]) => {
        setCategories(cats.data);
        setSubs(types.data);
        setError(null);
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }

  useEffect(load, []);

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiRequest<ServiceCategory>("/api/v1/services/categories", {
        method: "POST",
        body: { name: name.trim(), sort_order: categories?.length ?? 0 },
      });
      setCategories((current) => [...(current ?? []), created]);
      setName("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(row: ServiceCategory) {
    try {
      const next = await apiRequest<ServiceCategory>(`/api/v1/services/categories/${row.id}`, {
        method: "PATCH",
        body: { active: !row.active },
      });
      setCategories((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  if (!categories || !subs) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading service types" />;

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Residents can only pick types you keep open. The SLA on each type is what residents see on every listing in that type.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} onSubmit={addCategory}>
        <TextField label="New category" value={name} onChange={(event) => setName(event.target.value)} size="small" sx={{ minWidth: 220 }} />
        <Button type="submit" variant="contained" disabled={busy || !name.trim()}>
          Add category
        </Button>
      </Stack>
      {categories.map((category) => (
        <Box key={category.id} sx={surfaceSx}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>{category.name}</Typography>
              <Chip label={category.active ? "Open" : "Hidden"} size="small" color={category.active ? "success" : "default"} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2">{category.active ? "Shown in the directory" : "Hidden from residents"}</Typography>
              <Switch checked={category.active} onChange={() => void toggleCategory(category)} inputProps={{ "aria-label": `Toggle ${category.name}` }} />
            </Stack>
          </Stack>
          <Stack spacing={1.5}>
            {subs
              .filter((row) => row.category_id === category.id)
              .map((row) => (
                <SubcategoryEditor
                  key={row.id}
                  row={row}
                  onChange={(next) => setSubs((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null)}
                  onError={setError}
                />
              ))}
            <NewSubcategory categoryId={category.id} onCreated={(row) => setSubs((current) => [...(current ?? []), row])} onError={setError} />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function SubcategoryEditor({
  row,
  onChange,
  onError,
}: {
  row: ServiceSubcategory;
  onChange: (row: ServiceSubcategory) => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState(row.name);
  const [response, setResponse] = useState(row.response_hours != null ? String(row.response_hours) : "");
  const [completion, setCompletion] = useState(row.completion_hours != null ? String(row.completion_hours) : "");
  const [note, setNote] = useState(row.sla_note);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    onError(null);
    try {
      const next = await apiRequest<ServiceSubcategory>(`/api/v1/services/subcategories/${row.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          response_hours: response ? Number(response) : null,
          completion_hours: completion ? Number(completion) : null,
          sla_note: note,
        },
      });
      onChange(next);
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    try {
      const next = await apiRequest<ServiceSubcategory>(`/api/v1/services/subcategories/${row.id}`, {
        method: "PATCH",
        body: { active: !row.active },
      });
      onChange(next);
    } catch (reason) {
      onError(errorMessage(reason));
    }
  }

  return (
    <Box sx={insetSurfaceSx}>
      <Stack spacing={1}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" } }}>
          <TextField label="Type" value={name} onChange={(event) => setName(event.target.value)} size="small" sx={{ minWidth: 180 }} />
          <TextField label="Respond (hours)" value={response} onChange={(event) => setResponse(event.target.value)} size="small" inputMode="numeric" sx={{ width: 140 }} />
          <TextField label="Finish (hours)" value={completion} onChange={(event) => setCompletion(event.target.value)} size="small" inputMode="numeric" sx={{ width: 140 }} />
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", ml: { md: "auto" } }}>
            <Chip label={row.active ? "Open" : "Hidden"} size="small" />
            <Switch checked={row.active} onChange={() => void toggle()} inputProps={{ "aria-label": `Toggle ${row.name}` }} />
          </Stack>
        </Stack>
        <TextField label="SLA note residents see" value={note} onChange={(event) => setNote(event.target.value)} size="small" fullWidth />
        <Typography variant="body2" color="text.secondary">
          Live preview: {slaLine({ response_hours: response ? Number(response) : null, completion_hours: completion ? Number(completion) : null, note })}
        </Typography>
        <Button onClick={() => void save()} disabled={busy} sx={{ alignSelf: "flex-start" }}>
          Save SLA
        </Button>
      </Stack>
    </Box>
  );
}

function NewSubcategory({
  categoryId,
  onCreated,
  onError,
}: {
  categoryId: string;
  onCreated: (row: ServiceSubcategory) => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [response, setResponse] = useState("24");
  const [completion, setCompletion] = useState("48");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const created = await apiRequest<ServiceSubcategory>("/api/v1/services/subcategories", {
        method: "POST",
        body: {
          category_id: categoryId,
          name: name.trim(),
          response_hours: response ? Number(response) : null,
          completion_hours: completion ? Number(completion) : null,
          sla_note: note,
        },
      });
      onCreated(created);
      setName("");
      setNote("");
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={1} onSubmit={add} sx={{ alignItems: { md: "flex-end" } }}>
      <TextField label="New type" value={name} onChange={(event) => setName(event.target.value)} size="small" sx={{ minWidth: 160 }} />
      <TextField label="Respond (hours)" value={response} onChange={(event) => setResponse(event.target.value)} size="small" inputMode="numeric" sx={{ width: 140 }} />
      <TextField label="Finish (hours)" value={completion} onChange={(event) => setCompletion(event.target.value)} size="small" inputMode="numeric" sx={{ width: 140 }} />
      <TextField label="SLA note" value={note} onChange={(event) => setNote(event.target.value)} size="small" sx={{ flex: 1 }} />
      <Button type="submit" variant="outlined" disabled={busy || !name.trim()}>
        Add type
      </Button>
    </Stack>
  );
}
