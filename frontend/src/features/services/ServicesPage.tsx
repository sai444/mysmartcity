import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { apiGet, apiRequest, errorMessage, fieldErrors } from "../../api/client";
import type { LocalService, ServiceCatalogCategory, ServiceWrite } from "../../api/types";
import { insetSurfaceSx, linkSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { useWard } from "../city/WardContext";
import { PageIntro } from "../life/ui";
import { listingPrice, rupeesToPaise, SERVICE_STATUS, slaLine } from "./labels";

const TABS = [
  { id: "", label: "Browse" },
  { id: "offer", label: "Offer a service" },
  { id: "mine", label: "My listings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SHOW_EMPTY = { inputLabel: { shrink: true }, select: { displayEmpty: true } } as const;

export default function ServicesPage() {
  const splat = (useParams()["*"] ?? "").replace(/\/$/, "");
  const navigate = useNavigate();
  const tab = TABS.find((item) => item.id === splat);

  if (!tab) return <ServiceDetail id={splat} />;

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="NEIGHBOURHOOD HELP"
        title="Local services"
        lede="Find a plumber, tutor, or nurse in your ward. Cost, contact, and the city’s response time are on every listing. New services go live after the city desk approves them."
      />
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab.id}
          onChange={(_event, next: TabId) => navigate(next ? `/services/${next}` : "/services")}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Service sections"
        >
          {TABS.map((item) => (
            <Tab key={item.id || "browse"} value={item.id} label={item.label} sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }} />
          ))}
        </Tabs>
      </Box>
      {tab.id === "" && <BrowseTab />}
      {tab.id === "offer" && <OfferTab />}
      {tab.id === "mine" && <MineTab />}
    </Stack>
  );
}

function SignInFirst({ action }: { action: string }) {
  const signIn = useLoginPath();
  return (
    <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        Sign in to {action}.
      </Typography>
      <Button component={RouterLink} to={signIn} variant="contained">
        Sign in
      </Button>
    </Box>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
      <Typography color="text.secondary">{children}</Typography>
    </Box>
  );
}

function StatusChip({ status }: { status: LocalService["status"] }) {
  const chip = SERVICE_STATUS[status];
  return <Chip label={chip.label} color={chip.color} size="small" variant={status === "approved" ? "filled" : "outlined"} />;
}

function ServiceCard({ listing }: { listing: LocalService }) {
  return (
    <Box component={RouterLink} to={`/services/${listing.id}`} sx={[linkSurfaceSx, { display: "flex", flexDirection: "column", gap: 0.75 }]}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Typography sx={{ fontWeight: 700 }}>{listing.title}</Typography>
        <Typography sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{listingPrice(listing.price_paise)}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {listing.category_name} · {listing.subcategory_name} · {listing.ward_name}
      </Typography>
      <Typography variant="body2">{listing.area_text}</Typography>
      <Typography variant="body2" color="text.secondary">
        {listing.provider_name}
        {listing.contact_phone ? ` · ${listing.contact_phone}` : ""}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {slaLine(listing.sla)}
      </Typography>
    </Box>
  );
}

function BrowseTab() {
  const { wards } = useWard();
  const [catalog, setCatalog] = useState<ServiceCatalogCategory[] | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [ward, setWard] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<LocalService[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: ServiceCatalogCategory[] }>("/api/v1/services/catalog")
      .then((payload) => setCatalog(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const subs = useMemo(() => catalog?.find((row) => row.id === categoryId)?.subcategories ?? [], [catalog, categoryId]);

  useEffect(() => {
    if (subcategoryId && !subs.some((row) => row.id === subcategoryId)) setSubcategoryId("");
  }, [subs, subcategoryId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (categoryId) params.set("category_id", categoryId);
    if (subcategoryId) params.set("subcategory_id", subcategoryId);
    if (ward) params.set("ward_id", ward);
    if (debounced.trim()) params.set("q", debounced.trim());
    setRows(null);
    apiGet<{ data: LocalService[] }>(`/api/v1/services?${params.toString()}`)
      .then((payload) => {
        setRows(payload.data);
        setError(null);
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [categoryId, subcategoryId, ward, debounced]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Plumber, tutor, nurse" fullWidth />
        <TextField select label="Ward" value={ward} onChange={(event) => setWard(event.target.value)} size="small" sx={{ minWidth: 180 }} slotProps={SHOW_EMPTY}>
          <MenuItem value="">All wards</MenuItem>
          {wards.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <Button component={RouterLink} to="/services/offer" variant="contained" sx={{ flex: "0 0 auto" }}>
          Offer a service
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Chip label="All" color={categoryId === "" ? "primary" : "default"} onClick={() => setCategoryId("")} />
        {(catalog ?? []).map((row) => (
          <Chip key={row.id} label={row.name} color={categoryId === row.id ? "primary" : "default"} onClick={() => setCategoryId(row.id)} />
        ))}
      </Stack>
      {subs.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Chip label="All types" color={subcategoryId === "" ? "primary" : "default"} onClick={() => setSubcategoryId("")} />
          {subs.map((row) => (
            <Chip key={row.id} label={row.name} color={subcategoryId === row.id ? "primary" : "default"} onClick={() => setSubcategoryId(row.id)} />
          ))}
        </Stack>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <CircularProgress aria-label="Loading services" />}
      {rows?.length === 0 && <Empty>No services match. Try another ward or type, or offer one yourself.</Empty>}
      {rows && rows.length > 0 && (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, minmax(0, 1fr))" } }}>
          {rows.map((row) => (
            <ServiceCard key={row.id} listing={row} />
          ))}
        </Box>
      )}
    </Stack>
  );
}

function ServiceDetail({ id }: { id: string }) {
  const { ready } = useAuth();
  const [listing, setListing] = useState<LocalService | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    apiGet<LocalService>(`/api/v1/services/${encodeURIComponent(id)}`)
      .then(setListing)
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [id, ready]);

  if (error) {
    return (
      <Stack spacing={1.5}>
        <Alert severity="error">{error}</Alert>
        <Button component={RouterLink} to="/services">
          Back to services
        </Button>
      </Stack>
    );
  }
  if (!listing) return <CircularProgress aria-label="Loading service" />;

  return (
    <Stack spacing={2}>
      <Button component={RouterLink} to="/services" sx={{ alignSelf: "flex-start" }}>
        ← All services
      </Button>
      <Box sx={surfaceSx}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography variant="h1">{listing.title}</Typography>
            {listing.status !== "approved" && <StatusChip status={listing.status} />}
            {listing.mine && <Chip label="Yours" size="small" />}
          </Stack>
          <Typography sx={{ fontFamily: '"Outfit", sans-serif', fontSize: "1.75rem", fontWeight: 700 }}>{listingPrice(listing.price_paise)}</Typography>
          <Typography color="text.secondary">
            {listing.category_name} · {listing.subcategory_name} · {listing.ward_name}
          </Typography>
          <Typography>{listing.area_text}</Typography>
          <Typography sx={{ whiteSpace: "pre-line" }}>{listing.details}</Typography>
          <Box sx={insetSurfaceSx}>
            <Typography sx={{ fontWeight: 700 }}>City SLA</Typography>
            <Typography variant="body2">{slaLine(listing.sla)}</Typography>
          </Box>
          <Box sx={insetSurfaceSx}>
            <Typography sx={{ fontWeight: 700 }}>Contact the provider</Typography>
            <Typography>{listing.provider_name}</Typography>
            <Typography>{listing.contact_name}</Typography>
            {listing.contact_phone ? (
              <Button href={`tel:${listing.contact_phone.replace(/\s/g, "")}`} sx={{ alignSelf: "flex-start", px: 0 }}>
                {listing.contact_phone}
              </Button>
            ) : (
              <Typography color="text.secondary">Phone is shown once the city desk approves this listing.</Typography>
            )}
          </Box>
          {listing.review_note && (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Desk note: {listing.review_note}
            </Typography>
          )}
          {listing.mine && (
            <Button component={RouterLink} to="/services/mine" variant="contained" sx={{ alignSelf: "flex-start" }}>
              Manage your listing
            </Button>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

function OfferTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return <SignInFirst action="offer a service" />;
  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Pick a type the city already approved. Your cost, area, and phone go to the desk first. Residents see them after approval, along with the SLA for that type.
      </Typography>
      <ServiceForm
        onSaved={(saved) => navigate(saved.status === "approved" ? `/services/${saved.id}` : "/services/mine")}
      />
    </Stack>
  );
}

function MineTab() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LocalService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LocalService | null>(null);

  useEffect(() => {
    if (!user) return;
    apiGet<{ data: LocalService[] }>("/api/v1/services/mine")
      .then((payload) => setRows(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [user]);

  if (!user) return <SignInFirst action="see your service listings" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <CircularProgress aria-label="Loading your services" />;
  if (rows.length === 0) {
    return (
      <Empty>You have not offered a service yet. Use Offer a service to send one to the city desk.</Empty>
    );
  }

  return (
    <Stack spacing={1.5}>
      {rows.map((row) =>
        editing?.id === row.id ? (
          <Box key={row.id} sx={surfaceSx}>
            <ServiceForm
              existing={row}
              onSaved={(saved) => {
                setRows((current) => current?.map((item) => (item.id === saved.id ? saved : item)) ?? null);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          </Box>
        ) : (
          <ManagedCard
            key={row.id}
            listing={row}
            onEdit={() => setEditing(row)}
            onRemoved={() => setRows((current) => current?.filter((item) => item.id !== row.id) ?? null)}
          />
        ),
      )}
    </Stack>
  );
}

function ManagedCard({ listing, onEdit, onRemoved }: { listing: LocalService; onEdit: () => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Remove "${listing.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/services/${listing.id}`, { method: "DELETE" });
      onRemoved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={surfaceSx}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{listing.title}</Typography>
          <StatusChip status={listing.status} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {listing.category_name} · {listing.subcategory_name} · {listingPrice(listing.price_paise)}
        </Typography>
        <Typography variant="body2">{listing.area_text}</Typography>
        <Typography variant="body2" color="text.secondary">
          {listing.contact_name} · {listing.contact_phone} · {slaLine(listing.sla)}
        </Typography>
        {listing.review_note && (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Desk note: {listing.review_note}
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button component={RouterLink} to={`/services/${listing.id}`}>
            View
          </Button>
          <Button onClick={onEdit} disabled={busy}>
            Edit
          </Button>
          <Button color="error" onClick={() => void remove()} disabled={busy}>
            Remove
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

type FormState = {
  title: string;
  details: string;
  category_id: string;
  subcategory_id: string;
  price: string;
  ward_id: string;
  area_text: string;
  contact_name: string;
  contact_phone: string;
};

function ServiceForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing?: LocalService;
  onSaved: (saved: LocalService) => void;
  onCancel?: () => void;
}) {
  const { user } = useAuth();
  const { wards, wardId } = useWard();
  const [catalog, setCatalog] = useState<ServiceCatalogCategory[]>([]);
  const [form, setForm] = useState<FormState>(() => ({
    title: existing?.title ?? "",
    details: existing?.details ?? "",
    category_id: existing?.category_id ?? "",
    subcategory_id: existing?.subcategory_id ?? "",
    price: existing?.price_paise != null ? String(existing.price_paise / 100) : "",
    ward_id: existing?.ward_id ?? wardId,
    area_text: existing?.area_text ?? "",
    contact_name: existing?.contact_name ?? user?.display_name ?? "",
    contact_phone: existing?.contact_phone ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const selectedCategory = catalog.find((row) => row.id === form.category_id);
  const subs = selectedCategory?.subcategories ?? [];

  useEffect(() => {
    apiGet<{ data: ServiceCatalogCategory[] }>("/api/v1/services/catalog")
      .then((payload) => {
        setCatalog(payload.data);
        setForm((current) => {
          if (current.category_id) return current;
          const first = payload.data[0];
          return { ...current, category_id: first?.id ?? "", subcategory_id: first?.subcategories[0]?.id ?? "" };
        });
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    const options = catalog.find((row) => row.id === form.category_id)?.subcategories ?? [];
    if (form.subcategory_id && !options.some((row) => row.id === form.subcategory_id)) {
      setForm((current) => ({ ...current, subcategory_id: options[0]?.id ?? "" }));
    }
  }, [catalog, form.category_id, form.subcategory_id]);

  const selected = subs.find((row) => row.id === form.subcategory_id);
  const parsedPrice = rupeesToPaise(form.price);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (parsedPrice === undefined) {
      setErrors({ price_paise: "Enter a cost in rupees, or leave it blank for a quote." });
      return;
    }
    setBusy(true);
    setError(null);
    setErrors({});
    const body: ServiceWrite = {
      title: form.title,
      details: form.details,
      subcategory_id: form.subcategory_id,
      price_paise: parsedPrice,
      ward_id: form.ward_id || wardId,
      area_text: form.area_text,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
    };
    try {
      const saved = await apiRequest<LocalService>(existing ? `/api/v1/services/${existing.id}` : "/api/v1/services", {
        method: existing ? "PATCH" : "POST",
        body,
      });
      onSaved(saved);
    } catch (reason) {
      setError(errorMessage(reason));
      setErrors(fieldErrors(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack component="form" spacing={1.5} onSubmit={submit} noValidate>
      <TextField label="What you offer" value={form.title} onChange={(event) => set("title", event.target.value)} required error={!!errors.title} helperText={errors.title ?? "For example: Leak and tap repair"} />
      <TextField
        label="Details"
        value={form.details}
        onChange={(event) => set("details", event.target.value)}
        required
        multiline
        minRows={3}
        error={!!errors.details}
        helperText={errors.details ?? "What the job covers, what you bring, and when you can come."}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField select label="Category" value={form.category_id} onChange={(event) => set("category_id", event.target.value)} fullWidth>
          {catalog.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {row.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Type" value={form.subcategory_id} onChange={(event) => set("subcategory_id", event.target.value)} fullWidth error={!!errors.subcategory_id} helperText={errors.subcategory_id}>
          {subs.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {row.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {selected && (
        <Typography variant="body2" color="text.secondary">
          City SLA: {slaLine(selected.sla)}
        </Typography>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          label="Typical cost in rupees"
          value={form.price}
          onChange={(event) => set("price", event.target.value)}
          inputMode="decimal"
          fullWidth
          error={!!errors.price_paise}
          helperText={errors.price_paise ?? (parsedPrice ? listingPrice(parsedPrice) : "Leave blank if you quote after seeing the job")}
        />
        <TextField select label="Ward" value={form.ward_id || wardId} onChange={(event) => set("ward_id", event.target.value)} fullWidth error={!!errors.ward_id} helperText={errors.ward_id}>
          {wards.map((ward) => (
            <MenuItem key={ward.id} value={ward.id}>
              {ward.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <TextField label="Area you cover" value={form.area_text} onChange={(event) => set("area_text", event.target.value)} required error={!!errors.area_text} helperText={errors.area_text ?? "Streets or nearby wards"} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField label="Contact name" value={form.contact_name} onChange={(event) => set("contact_name", event.target.value)} required fullWidth error={!!errors.contact_name} helperText={errors.contact_name} />
        <TextField label="Contact phone" value={form.contact_phone} onChange={(event) => set("contact_phone", event.target.value)} required fullWidth error={!!errors.contact_phone} helperText={errors.contact_phone ?? "Residents call this number after the city desk approves you."} />
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? "Saving…" : existing ? "Save changes" : user?.role === "admin" ? "Publish listing" : "Send for approval"}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
