import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet, apiRequest, errorMessage } from "../../api/client";
import type { Broker, BrokerStatus, ManagedProperty, PropertyStatus } from "../../api/types";
import { insetSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { BROKER_STATUS, PROPERTY_STATUS } from "./labels";
import { ManagedListingCard } from "./PropertyParts";

export function PropertiesTab() {
  const [rows, setRows] = useState<ManagedProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PropertyStatus | "all">("pending");
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiGet<{ data: ManagedProperty[] }>("/api/v1/properties/manage")
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
            row.ward_name.toLowerCase().includes(needle) ||
            row.lister_name.toLowerCase().includes(needle)),
      ) ?? null,
    [rows, status, needle],
  );

  if (!rows) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading properties" />;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <TextField label="Search title, ward, or seller" value={query} onChange={(event) => setQuery(event.target.value)} size="small" sx={{ flex: 1, maxWidth: 360 }} />
        <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as PropertyStatus | "all")} size="small" sx={{ minWidth: 220 }}>
          <MenuItem value="all">All properties ({rows.length})</MenuItem>
          {(Object.keys(PROPERTY_STATUS) as PropertyStatus[]).map((key) => (
            <MenuItem key={key} value={key}>
              {PROPERTY_STATUS[key].label} ({rows.filter((row) => row.status === key).length})
            </MenuItem>
          ))}
        </TextField>
        <Button component={RouterLink} to="/property/sell" variant="contained" sx={{ flex: "0 0 auto" }}>
          Sell a property
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {filtered?.length === 0 && (
        <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
          <Typography color="text.secondary">No properties in this view. Listings from owners and brokers show up here for approval.</Typography>
        </Box>
      )}
      {filtered?.map((row) => (
        <ManagedListingCard
          key={row.id}
          listing={row}
          asAdmin
          brokerVerified={false}
          onChange={(next) => setRows((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null)}
          onRemoved={() => setRows((current) => current?.filter((item) => item.id !== row.id) ?? null)}
        />
      ))}
    </Stack>
  );
}

const BROKER_FLOW: Record<BrokerStatus, { status: "approved" | "rejected" | "revoked"; label: string; ask?: string }[]> = {
  pending: [
    { status: "approved", label: "Verify" },
    { status: "rejected", label: "Reject", ask: "Why is this application rejected? The broker sees this note." },
  ],
  approved: [{ status: "revoked", label: "Revoke", ask: "Why is verification revoked? The broker sees this note." }],
  rejected: [{ status: "approved", label: "Verify" }],
  revoked: [{ status: "approved", label: "Restore" }],
};

export function BrokersTab() {
  const [rows, setRows] = useState<Broker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: Broker[] }>("/api/v1/properties/brokers")
      .then((payload) => setRows(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  async function move(broker: Broker, step: (typeof BROKER_FLOW)[BrokerStatus][number]) {
    let note: string | null = null;
    if (step.ask) {
      const answer = window.prompt(step.ask, "");
      if (answer === null) return;
      note = answer;
    }
    setBusy(broker.user_id);
    setError(null);
    try {
      const next = await apiRequest<Broker>(`/api/v1/properties/brokers/${broker.user_id}/status`, {
        method: "POST",
        body: { status: step.status, note },
      });
      setRows((current) => current?.map((item) => (item.user_id === next.user_id ? next : item)) ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading brokers" />;
  if (rows.length === 0) {
    return (
      <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
        <Typography color="text.secondary">No broker applications yet. Residents apply from Property → Broker.</Typography>
      </Box>
    );
  }

  const ordered = [...rows].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error">{error}</Alert>}
      {ordered.map((broker) => {
        const chip = BROKER_STATUS[broker.status];
        return (
          <Box key={broker.user_id} sx={surfaceSx}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{broker.agency_name}</Typography>
                  <Chip label={chip.label} color={chip.color} size="small" variant={broker.status === "approved" ? "filled" : "outlined"} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {broker.display_name} · Licence {broker.license_no} · {broker.phone} · applied {new Date(broker.created_at).toLocaleDateString()}
                </Typography>
                {broker.about && <Typography variant="body2">{broker.about}</Typography>}
                {broker.review_note && (
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Note: {broker.review_note}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1} sx={{ flex: "0 0 auto" }}>
                {BROKER_FLOW[broker.status].map((step) => (
                  <Button
                    key={step.status}
                    variant={step.status === "approved" ? "contained" : "outlined"}
                    color={step.status === "approved" ? "success" : "error"}
                    disabled={busy === broker.user_id}
                    onClick={() => void move(broker, step)}
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
