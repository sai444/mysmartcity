import { Alert, Box, Button, Chip, MenuItem, Stack, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet, apiRequest, errorMessage, fieldErrors } from "../../api/client";
import type { CityMap, ManagedProperty, Property, PropertyOffer, PropertyType } from "../../api/types";
import { insetSurfaceSx, linkSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { LiveWeather } from "../city/LiveWeather";
import { useWard } from "../city/WardContext";
import { PlaceMap } from "../map/PlaceMap";
import { coverUrl, draftsFrom, hasCoverImage, mediaIds, type MediaDraft } from "../media/api";
import { MediaManager } from "../media/MediaManager";
import { LISTER_LABEL, OFFER_STATUS, PROPERTY_STATUS, PROPERTY_TYPE, propertyPrice, rupeesToPaise } from "./labels";

const TYPES = Object.entries(PROPERTY_TYPE) as [PropertyType, string][];
const EDITABLE = new Set(["pending", "approved", "rejected", "withdrawn", "disabled"]);
const MAX_MEDIA = 12;
const LEGACY_IMAGE = "legacy-image";

export function propertyCover(property: Property) {
  return property.image ?? coverUrl(property.media);
}

export function PropertyFacts({ property }: { property: Property }) {
  const parts = [
    PROPERTY_TYPE[property.property_type],
    `${property.area_sqft.toLocaleString("en-IN")} sq ft`,
    property.bedrooms !== null ? `${property.bedrooms} bed` : null,
    property.ward_name,
  ].filter(Boolean);
  return (
    <Typography variant="body2" color="text.secondary">
      {parts.join(" · ")}
    </Typography>
  );
}

export function ListerLine({ property }: { property: Property }) {
  const who =
    property.lister_role === "broker"
      ? `${property.agency_name ?? property.lister_name} (verified broker) for ${property.owner_name ?? "the owner"}`
      : property.lister_role === "admin"
        ? property.owner_name
          ? `City property desk, for ${property.owner_name}`
          : "Listed by the city property desk"
        : `${property.lister_name} (owner)`;
  return (
    <Typography variant="body2" color="text.secondary">
      {who}
      {property.commission_pct ? ` · ${property.commission_pct}% brokerage` : ""}
    </Typography>
  );
}

export function PropertyFlowSteps({ flow, active }: { flow: "buy" | "sell"; active: number }) {
  const steps = flow === "buy" ? ["Browse", "Offer", "Track"] : ["Role", "Details", "Photos", "Map", "Publish"];
  return (
    <Stepper activeStep={active} alternativeLabel aria-label={flow === "buy" ? "Buy a property" : "Sell a property"} sx={{ mb: 1 }}>
      {steps.map((label) => (
        <Step key={label}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

export const PROPERTY_PIN = "#9a3412";

export function StatusChip({ status }: { status: Property["status"] }) {
  const chip = PROPERTY_STATUS[status];
  return <Chip label={chip.label} color={chip.color} size="small" variant={status === "approved" ? "filled" : "outlined"} />;
}

export function PropertyCard({ property }: { property: Property }) {
  const cover = propertyCover(property);
  return (
    <Box component={RouterLink} to={`/property/${property.id}`} sx={[linkSurfaceSx, { p: 0, overflow: "hidden" }]}>
      {cover ? (
        <Box component="img" src={cover} alt={property.title} loading="lazy" sx={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
      ) : (
        <Box sx={{ height: 72, bgcolor: "action.hover" }} />
      )}
      <Stack spacing={0.5} sx={{ p: 1.75 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <Typography sx={{ fontWeight: 700 }}>{property.title}</Typography>
          <Typography sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{propertyPrice(property.price_paise)}</Typography>
        </Stack>
        <PropertyFacts property={property} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
          <Chip label={LISTER_LABEL[property.lister_role]} size="small" variant="outlined" />
          {property.status !== "approved" && <StatusChip status={property.status} />}
          {property.mine && <Chip label="Yours" size="small" />}
        </Stack>
      </Stack>
    </Box>
  );
}

type ListerKind = "owner" | "broker" | "admin";
type SellStep = "role" | "details" | "photos" | "map" | "review";

const SELL_STEPS: SellStep[] = ["role", "details", "photos", "map", "review"];
const SELL_STEP_LABEL: Record<SellStep, string> = {
  role: "Role",
  details: "Details",
  photos: "Photos",
  map: "Map",
  review: "Publish",
};

type FormState = {
  title: string;
  property_type: PropertyType;
  ward_id: string;
  address_text: string;
  area_sqft: string;
  bedrooms: string;
  price: string;
  description: string;
  contact_phone: string;
  list_as: ListerKind;
  owner_name: string;
  commission_pct: string;
  latitude: number | null;
  longitude: number | null;
  media: MediaDraft[];
};

function listAsOf(existing: Property | undefined, isAdmin: boolean): ListerKind {
  if (!existing) return isAdmin ? "admin" : "owner";
  if (existing.lister_role === "broker") return "broker";
  if (existing.lister_role === "admin") return existing.owner_name ? "owner" : "admin";
  return "owner";
}

function initialForm(wardId: string, existing: Property | undefined, isAdmin: boolean): FormState {
  if (!existing) {
    return {
      title: "",
      property_type: "flat",
      ward_id: wardId,
      address_text: "",
      area_sqft: "",
      bedrooms: "",
      price: "",
      description: "",
      contact_phone: "",
      list_as: listAsOf(undefined, isAdmin),
      owner_name: "",
      commission_pct: "",
      latitude: null,
      longitude: null,
      media: [],
    };
  }
  return {
    title: existing.title,
    property_type: existing.property_type,
    ward_id: existing.ward_id,
    address_text: existing.address_text,
    area_sqft: String(existing.area_sqft),
    bedrooms: existing.bedrooms === null ? "" : String(existing.bedrooms),
    price: String(existing.price_paise / 100),
    description: existing.description,
    contact_phone: existing.contact_phone ?? "",
    list_as: listAsOf(existing, isAdmin),
    owner_name: existing.owner_name ?? "",
    commission_pct: existing.commission_pct === null ? "" : String(existing.commission_pct),
    latitude: existing.latitude,
    longitude: existing.longitude,
    media: [...(existing.image ? [{ key: LEGACY_IMAGE, kind: "image" as const, src: existing.image }] : []), ...draftsFrom(existing.media)],
  };
}

export function PropertyForm({
  existing,
  isAdmin,
  brokerVerified,
  onSaved,
  onCancel,
}: {
  existing?: Property;
  isAdmin: boolean;
  brokerVerified: boolean;
  onSaved: (saved: ManagedProperty) => void;
  onCancel?: () => void;
}) {
  const { wards, wardId } = useWard();
  const skipRole = Boolean(existing && isAdmin && !existing.mine);
  const steps = skipRole ? SELL_STEPS.filter((step) => step !== "role") : SELL_STEPS;
  const [form, setForm] = useState<FormState>(() => initialForm(wardId, existing, isAdmin));
  const [step, setStep] = useState(0);
  const [placed, setPlaced] = useState(Boolean(existing?.latitude && existing?.longitude));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const hasRooms = form.property_type === "flat" || form.property_type === "house";
  const current = steps[Math.min(step, steps.length - 1)];
  const needsOwner = form.list_as === "broker" || (isAdmin && form.list_as === "owner");
  const brokerBlocked = !isAdmin && form.list_as === "broker" && !brokerVerified;
  const ward = form.ward_id || wardId;

  useEffect(() => {
    if (placed) return;
    const query = ward ? `?ward_id=${encodeURIComponent(ward)}` : "";
    let active = true;
    apiGet<CityMap>(`/api/v1/city/map${query}`)
      .then((payload) => {
        if (!active || placed) return;
        setForm((current) => ({ ...current, latitude: payload.center.latitude, longitude: payload.center.longitude }));
      })
      .catch(() => {
        if (!active || placed) return;
        setForm((current) => ({ ...current, latitude: 12.9716, longitude: 77.5946 }));
      });
    return () => {
      active = false;
    };
  }, [ward, placed]);

  async function submit() {
    const price = rupeesToPaise(form.price);
    if (price === null || form.latitude === null || form.longitude === null) {
      setError("Finish the asking price and place the pin on the map.");
      return;
    }
    if (!hasCoverImage(form.media)) {
      setErrors({ media: "Add at least one photo of the property." });
      setError("Add at least one photo of the property.");
      return;
    }
    setBusy(true);
    setError(null);
    setErrors({});
    const asBroker = !isAdmin && form.list_as === "broker";
    const body = {
      title: form.title,
      property_type: form.property_type,
      ward_id: ward,
      address_text: form.address_text,
      area_sqft: Number(form.area_sqft) || 0,
      bedrooms: hasRooms && form.bedrooms !== "" ? Number(form.bedrooms) : null,
      price_paise: price,
      description: form.description,
      contact_phone: form.contact_phone,
      list_as: asBroker ? "broker" : isAdmin && form.list_as === "admin" ? "admin" : "owner",
      owner_name: asBroker || (isAdmin && form.list_as === "owner") ? form.owner_name : null,
      commission_pct: asBroker && form.commission_pct !== "" ? Number(form.commission_pct) : null,
      latitude: form.latitude,
      longitude: form.longitude,
      image: form.media.some((draft) => draft.key === LEGACY_IMAGE) ? (existing?.image ?? null) : null,
      media: mediaIds(form.media),
    };
    try {
      const saved = await apiRequest<ManagedProperty>(existing ? `/api/v1/properties/${existing.id}` : "/api/v1/properties", {
        method: existing ? "PUT" : "POST",
        body,
      });
      onSaved(saved);
      if (!existing) {
        setForm(initialForm(wardId, undefined, isAdmin));
        setStep(0);
        setPlaced(false);
      }
    } catch (reason) {
      const mapped = fieldErrors(reason);
      setError(errorMessage(reason));
      setErrors(mapped);
      if (mapped.media) setStep(steps.indexOf("photos"));
      else if (mapped.latitude || mapped.longitude) setStep(steps.indexOf("map"));
      else if (mapped.owner_name || mapped.list_as) setStep(0);
      else setStep(Math.max(0, steps.indexOf("details")));
    } finally {
      setBusy(false);
    }
  }

  function problemFor(key: SellStep) {
    if (key === "role") {
      if (brokerBlocked) return "Get verified as a broker before listing for an owner.";
      if (needsOwner && !form.owner_name.trim()) return "Name the property owner.";
    }
    if (key === "details") {
      if (form.title.trim().length < 4) return "Enter a title of at least 4 characters.";
      if (!ward) return "Choose a ward.";
      if (form.address_text.trim().length < 3) return "Enter the address.";
      if (!Number(form.area_sqft)) return "Enter the area in square feet.";
      if (rupeesToPaise(form.price) === null) return "Enter the asking price in rupees.";
      if (form.description.trim().length < 10) return "Write a short description (at least 10 characters).";
      if (form.contact_phone.trim().length < 7) return "Enter a contact phone number.";
    }
    if (key === "photos" && !hasCoverImage(form.media)) return "Add at least one photo of the property.";
    if (key === "map" && (form.latitude === null || form.longitude === null)) return "Wait for the map, then place the pin.";
    return null;
  }

  function continueStep(event?: FormEvent) {
    event?.preventDefault();
    const problem = problemFor(current);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (current === "review") {
      void submit();
      return;
    }
    setStep((value) => value + 1);
  }

  const roles: { id: ListerKind; title: string; lede: string }[] = isAdmin
    ? [
        { id: "admin", title: "City property desk", lede: "A city listing. It goes live as soon as you publish." },
        { id: "owner", title: "For an owner", lede: "List on behalf of a resident. Name them. It goes live immediately." },
      ]
    : [
        { id: "owner", title: "I own this property", lede: "You are selling your home, plot, or shop. The city checks it before it goes live." },
        {
          id: "broker",
          title: "I am a broker",
          lede: brokerVerified
            ? "List for an owner. Your agency badge appears on the listing."
            : "Get verified first, then list for owners.",
        },
      ];

  return (
    <Stack component="form" spacing={2} onSubmit={continueStep} noValidate>
      <Stepper activeStep={step} alternativeLabel>
        {steps.map((key) => (
          <Step key={key}>
            <StepLabel>{SELL_STEP_LABEL[key]}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {current === "role" && (
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 700 }}>{existing ? "Who is this listing for?" : "Who is selling?"}</Typography>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            {roles.map((role) => (
              <Box
                key={role.id}
                component="button"
                type="button"
                onClick={() => set("list_as", role.id)}
                sx={[
                  insetSurfaceSx,
                  {
                    textAlign: "left",
                    font: "inherit",
                    cursor: "pointer",
                    borderColor: form.list_as === role.id ? "primary.main" : "divider",
                    outline: form.list_as === role.id ? "2px solid" : "none",
                    outlineColor: "primary.main",
                  },
                ]}
              >
                <Typography sx={{ fontWeight: 700 }}>{role.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {role.lede}
                </Typography>
              </Box>
            ))}
          </Box>
          {brokerBlocked && (
            <Alert
              severity="info"
              action={
                <Button color="inherit" size="small" component={RouterLink} to="/property/broker">
                  Apply
                </Button>
              }
            >
              The city must verify your RERA licence before you can list for an owner.
            </Alert>
          )}
          {needsOwner && !brokerBlocked && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                label="Owner's name"
                value={form.owner_name}
                onChange={(event) => set("owner_name", event.target.value)}
                required
                fullWidth
                error={!!errors.owner_name}
                helperText={errors.owner_name}
              />
              {form.list_as === "broker" && (
                <TextField
                  label="Brokerage %"
                  value={form.commission_pct}
                  onChange={(event) => set("commission_pct", event.target.value)}
                  inputMode="decimal"
                  sx={{ minWidth: 140 }}
                  error={!!errors.commission_pct}
                  helperText={errors.commission_pct}
                />
              )}
            </Stack>
          )}
        </Stack>
      )}

      {current === "details" && (
        <Stack spacing={1.5}>
          <TextField label="Title" value={form.title} onChange={(event) => set("title", event.target.value)} required error={!!errors.title} helperText={errors.title ?? "For example: 2 BHK flat near the lake"} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField select label="Type" value={form.property_type} onChange={(event) => set("property_type", event.target.value as PropertyType)} fullWidth>
              {TYPES.map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Ward"
              value={ward}
              onChange={(event) => {
                setPlaced(false);
                setForm((currentForm) => ({ ...currentForm, ward_id: event.target.value, latitude: null, longitude: null }));
              }}
              fullWidth
              error={!!errors.ward_id}
              helperText={errors.ward_id}
            >
              {wards.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField label="Address" value={form.address_text} onChange={(event) => set("address_text", event.target.value)} required error={!!errors.address_text} helperText={errors.address_text} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField label="Area in sq ft" value={form.area_sqft} onChange={(event) => set("area_sqft", event.target.value)} required inputMode="numeric" fullWidth error={!!errors.area_sqft} helperText={errors.area_sqft} />
            {hasRooms && (
              <TextField label="Bedrooms" value={form.bedrooms} onChange={(event) => set("bedrooms", event.target.value)} inputMode="numeric" fullWidth error={!!errors.bedrooms} helperText={errors.bedrooms} />
            )}
            <TextField
              label="Asking price in rupees"
              value={form.price}
              onChange={(event) => set("price", event.target.value)}
              required
              inputMode="decimal"
              fullWidth
              error={!!errors.price_paise}
              helperText={errors.price_paise ?? (rupeesToPaise(form.price) ? propertyPrice(rupeesToPaise(form.price) ?? 0) : " ")}
            />
          </Stack>
          <TextField label="Description" value={form.description} onChange={(event) => set("description", event.target.value)} required multiline minRows={3} error={!!errors.description} helperText={errors.description ?? "Floor, facing, parking, water, documents."} />
          <TextField label="Contact phone" value={form.contact_phone} onChange={(event) => set("contact_phone", event.target.value)} required error={!!errors.contact_phone} helperText={errors.contact_phone ?? "Shared with a buyer only after you accept their offer."} />
        </Stack>
      )}

      {current === "photos" && (
        <MediaManager
          value={form.media}
          onChange={(media) => set("media", media)}
          onError={setError}
          onBusyChange={setUploading}
          max={MAX_MEDIA}
          hint={`Required. Up to ${MAX_MEDIA}. Show every room, the view, and a walkthrough video. The first photo is the cover.`}
          required
          disabled={busy}
        />
      )}

      {current === "map" && (
        <Stack spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>Pin on the map</Typography>
          <Typography color="text.secondary">Tap the map to place the property. Buyers see it with other city places.</Typography>
          {form.latitude !== null && form.longitude !== null && (
            <PlaceMap
              center={{ latitude: form.latitude, longitude: form.longitude }}
              zoom={15}
              height={320}
              onPick={(latitude, longitude) => {
                setPlaced(true);
                setForm((currentForm) => ({ ...currentForm, latitude, longitude }));
              }}
              pins={[
                {
                  id: existing?.id ?? "draft",
                  name: form.title.trim() || "New listing",
                  latitude: form.latitude,
                  longitude: form.longitude,
                  color: PROPERTY_PIN,
                  label: PROPERTY_TYPE[form.property_type],
                },
              ]}
            />
          )}
          <LiveWeather latitude={form.latitude} longitude={form.longitude} compact />
        </Stack>
      )}

      {current === "review" && (
        <Stack spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>{form.title.trim() || "New listing"}</Typography>
          <Typography color="text.secondary">
            {PROPERTY_TYPE[form.property_type]} · {wards.find((item) => item.id === ward)?.name ?? "Ward"} · {form.area_sqft} sq ft
            {rupeesToPaise(form.price) ? ` · ${propertyPrice(rupeesToPaise(form.price) ?? 0)}` : ""}
          </Typography>
          <Typography>{form.address_text}</Typography>
          <Typography sx={{ whiteSpace: "pre-line" }}>{form.description}</Typography>
          <ListerLine
            property={{
              lister_role: form.list_as === "broker" ? "broker" : isAdmin ? "admin" : "owner",
              lister_name: isAdmin ? "City property desk" : "You",
              agency_name: null,
              owner_name: needsOwner ? form.owner_name : null,
              commission_pct: form.list_as === "broker" && form.commission_pct ? Number(form.commission_pct) : null,
            } as Property}
          />
          <Typography variant="body2" color="text.secondary">
            {form.media.length} photo{form.media.length === 1 ? "" : "s"} and videos · {placed ? "Pin placed on the map." : "Pin starts at the ward centre. Go back to move it."}
          </Typography>
          <Alert severity="info">
            {isAdmin
              ? "This listing goes live as soon as you publish. Buyers can send offers immediately."
              : "The city checks this listing before buyers see it. Offers arrive on My listings, where you accept one and mark it sold."}
          </Alert>
        </Stack>
      )}

      {errors.media && <Alert severity="error">{errors.media}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        {step > 0 && (
          <Button
            onClick={() => {
              setError(null);
              setStep((value) => value - 1);
            }}
            disabled={busy}
          >
            Back
          </Button>
        )}
        <Button type="submit" variant="contained" disabled={busy || uploading || brokerBlocked}>
          {uploading ? "Uploading…" : busy ? "Saving…" : current === "review" ? (existing ? "Save changes" : isAdmin ? "Publish listing" : "Send for approval") : "Continue"}
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

export function ManagedListingCard({
  listing,
  asAdmin,
  brokerVerified,
  onChange,
  onRemoved,
}: {
  listing: ManagedProperty;
  asAdmin: boolean;
  brokerVerified: boolean;
  onChange: (next: ManagedProperty) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(listing.status === "pending" || listing.offers.some((offer) => offer.status === "pending" || offer.status === "accepted"));
  const base = `/api/v1/properties/${listing.id}`;
  const accepted = listing.offers.find((offer) => offer.status === "accepted");

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const post = (path: string, body: unknown = {}) =>
    run(async () => onChange(await apiRequest<ManagedProperty>(`${base}${path}`, { method: "POST", body })));

  const review = (status: "approved" | "rejected" | "disabled", ask?: string) => {
    let note: string | null = null;
    if (ask) {
      const answer = window.prompt(ask, "");
      if (answer === null) return;
      note = answer;
    }
    void post("/status", { status, note });
  };

  const decide = (offer: PropertyOffer, action: "accept" | "decline") => {
    const answer = window.prompt(
      action === "accept" ? `Accept ${offer.buyer_name}'s offer? Add a note for them (optional).` : "Reason for declining (optional)",
      "",
    );
    if (answer === null) return;
    void post(`/offers/${offer.id}/decision`, { action, note: answer });
  };

  const complete = () => {
    const suggested = accepted ? accepted.amount_paise : listing.price_paise;
    const answer = window.prompt(
      `Mark "${listing.title}" as sold? Final price in rupees:`,
      String(suggested / 100),
    );
    if (answer === null) return;
    const paise = rupeesToPaise(answer);
    if (paise === null) {
      setError("Enter the final price in rupees.");
      return;
    }
    void post("/complete", { sold_price_paise: paise });
  };

  const remove = () =>
    run(async () => {
      if (!window.confirm(`Delete "${listing.title}" permanently? This cannot be undone.`)) return;
      await apiRequest<void>(base, { method: "DELETE" });
      onRemoved();
    });

  if (editing) {
    return (
      <Box sx={surfaceSx}>
        <Typography variant="h2" sx={{ mb: 1.5 }}>
          Edit {listing.title}
        </Typography>
        <PropertyForm
          existing={listing}
          isAdmin={asAdmin}
          brokerVerified={brokerVerified}
          onSaved={(saved) => {
            onChange(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </Box>
    );
  }

  const live = listing.status === "approved" || listing.status === "under_offer";

  return (
    <Box sx={surfaceSx}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{listing.title}</Typography>
            <StatusChip status={listing.status} />
            {listing.offer_count > 0 && <Chip label={`${listing.offer_count} open ${listing.offer_count === 1 ? "offer" : "offers"}`} size="small" variant="outlined" />}
          </Stack>
          <Typography sx={{ fontWeight: 600 }}>
            {listing.status === "sold" && listing.sold_price_paise !== null
              ? `Sold for ${propertyPrice(listing.sold_price_paise)} (asked ${propertyPrice(listing.price_paise)})`
              : propertyPrice(listing.price_paise)}
          </Typography>
          <PropertyFacts property={listing} />
          <ListerLine property={listing} />
          {listing.review_note && (
            <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
              Note from the city: {listing.review_note}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, flex: "0 0 auto" }}>
          {asAdmin && listing.status === "pending" && (
            <>
              <Button variant="contained" color="success" disabled={busy} onClick={() => review("approved")}>
                Approve
              </Button>
              <Button variant="outlined" color="error" disabled={busy} onClick={() => review("rejected", "Why is this listing rejected? The seller sees this note.")}>
                Reject
              </Button>
            </>
          )}
          {asAdmin && (listing.status === "rejected" || listing.status === "disabled") && (
            <Button variant="outlined" color="success" disabled={busy} onClick={() => review("approved")}>
              {listing.status === "disabled" ? "Put back up" : "Approve"}
            </Button>
          )}
          {asAdmin && live && (
            <Button variant="outlined" disabled={busy} onClick={() => review("disabled", "Reason for taking this listing down (optional)")}>
              Take down
            </Button>
          )}
          {live && (
            <Button variant={listing.status === "under_offer" ? "contained" : "outlined"} disabled={busy} onClick={complete}>
              Mark sold
            </Button>
          )}
          {listing.status === "under_offer" && (
            <Button variant="outlined" disabled={busy} onClick={() => void post("/release")}>
              Cancel deal
            </Button>
          )}
          {live && (
            <Button component={RouterLink} to={`/property/${listing.id}`}>
              View
            </Button>
          )}
          {EDITABLE.has(listing.status) && (
            <Button disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {["pending", "approved", "rejected", "disabled"].includes(listing.status) && (listing.mine || !asAdmin) && (
            <Button disabled={busy} onClick={() => void post("/withdraw")}>
              Withdraw
            </Button>
          )}
          {listing.status === "withdrawn" && (
            <Button disabled={busy} onClick={() => void post("/relist")}>
              List again
            </Button>
          )}
          <Button onClick={() => setOpen((current) => !current)}>{open ? "Hide offers" : `Offers (${listing.offers.length})`}</Button>
          {(asAdmin || !["under_offer", "sold"].includes(listing.status)) && (
            <Button color="error" disabled={busy} onClick={() => void remove()}>
              Delete
            </Button>
          )}
        </Stack>
      </Stack>

      {open && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          {listing.offers.length === 0 && (
            <Box sx={[insetSurfaceSx, { textAlign: "center" }]}>
              <Typography variant="body2" color="text.secondary">
                {live ? "No offers yet. Buyers' offers show up here." : "Offers open once the listing is live."}
              </Typography>
            </Box>
          )}
          {listing.offers.map((offer) => {
            const chip = OFFER_STATUS[offer.status];
            return (
              <Box key={offer.id} sx={[insetSurfaceSx, { display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, alignItems: { sm: "center" } }]}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 700 }}>
                      {propertyPrice(offer.amount_paise)} from {offer.buyer_name}
                    </Typography>
                    <Chip label={chip.label} color={chip.color} size="small" variant="outlined" />
                  </Stack>
                  {offer.message && <Typography variant="body2">“{offer.message}”</Typography>}
                  <Typography variant="body2" color="text.secondary">
                    {offer.buyer_phone ?? ""} · {new Date(offer.created_at).toLocaleDateString()}
                    {offer.seller_note ? ` · Your note: ${offer.seller_note}` : ""}
                  </Typography>
                </Box>
                {offer.status === "pending" && (
                  <Stack direction="row" spacing={1} sx={{ flex: "0 0 auto" }}>
                    <Button size="small" variant="contained" color="success" disabled={busy || listing.status !== "approved"} onClick={() => decide(offer, "accept")}>
                      Accept
                    </Button>
                    <Button size="small" color="error" disabled={busy} onClick={() => decide(offer, "decline")}>
                      Decline
                    </Button>
                  </Stack>
                )}
              </Box>
            );
          })}
          {listing.status === "under_offer" && (
            <Typography variant="body2" color="text.secondary">
              While a deal is in progress, other buyers can still leave backup offers. Cancel the deal to accept a different one.
            </Typography>
          )}
        </Stack>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
