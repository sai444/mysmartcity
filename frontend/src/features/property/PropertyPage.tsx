import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { apiGet, apiRequest, errorMessage, fieldErrors } from "../../api/client";
import type { Broker, BuyerOffer, ManagedProperty, Property, PropertyType } from "../../api/types";
import { insetSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { LiveWeather } from "../city/LiveWeather";
import { useWard } from "../city/WardContext";
import { PageIntro } from "../life/ui";
import { PlaceMap } from "../map/PlaceMap";
import { galleryOf, MediaGallery } from "../media/MediaGallery";
import { BROKER_STATUS, OFFER_STATUS, PROPERTY_TYPE, propertyPrice, rupeesToPaise } from "./labels";
import { ListerLine, ManagedListingCard, PROPERTY_PIN, PropertyCard, PropertyFacts, PropertyFlowSteps, PropertyForm, StatusChip } from "./PropertyParts";

const TABS = [
  { id: "", label: "Buy" },
  { id: "sell", label: "Sell" },
  { id: "listings", label: "My listings" },
  { id: "offers", label: "My offers" },
  { id: "broker", label: "Broker" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SHOW_EMPTY = { inputLabel: { shrink: true }, select: { displayEmpty: true } } as const;

export default function PropertyPage() {
  const splat = (useParams()["*"] ?? "").replace(/\/$/, "");
  const navigate = useNavigate();
  const tab = TABS.find((item) => item.id === splat);

  if (!tab) return <PropertyDetail id={splat} />;

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="REAL ESTATE"
        title="Property"
        lede="Two full flows: buy with an offer, or sell as an owner, a verified broker, or the city desk. Listings sit on the city map once they are live."
      />
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab.id}
          onChange={(_event, next: TabId) => navigate(next ? `/property/${next}` : "/property")}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Property sections"
        >
          {TABS.map((item) => (
            <Tab key={item.id || "buy"} value={item.id} label={item.label} sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }} />
          ))}
        </Tabs>
      </Box>
      {tab.id === "" && <BrowseTab />}
      {tab.id === "sell" && <SellTab />}
      {tab.id === "listings" && <ListingsTab />}
      {tab.id === "offers" && <OffersTab />}
      {tab.id === "broker" && <BrokerTab />}
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

function useBroker(enabled: boolean) {
  const [broker, setBroker] = useState<Broker | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    apiGet<{ broker: Broker | null }>("/api/v1/properties/brokers/me")
      .then((payload) => setBroker(payload.broker))
      .catch(() => setBroker(null));
  }, [enabled]);
  return [broker, setBroker] as const;
}

function BrowseTab() {
  const { wards } = useWard();
  const [ward, setWard] = useState("");
  const [type, setType] = useState<PropertyType | "">("");
  const [rows, setRows] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams();
    if (ward) query.set("ward_id", ward);
    if (type) query.set("property_type", type);
    setRows(null);
    setSelectedId(null);
    apiGet<{ data: Property[] }>(`/api/v1/properties?${query.toString()}`)
      .then((payload) => {
        setRows(payload.data);
        setError(null);
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [ward, type]);

  const pins =
    rows?.map((row) => ({
      id: row.id,
      name: row.title,
      latitude: row.latitude,
      longitude: row.longitude,
      color: PROPERTY_PIN,
      label: PROPERTY_TYPE[row.property_type],
      detail: propertyPrice(row.price_paise),
      href: `/property/${row.id}`,
    })) ?? [];
  const selected = pins.find((pin) => pin.id === selectedId);
  const center = pins[0] ? { latitude: pins[0].latitude, longitude: pins[0].longitude } : { latitude: 12.9716, longitude: 77.5946 };

  return (
    <Stack spacing={2}>
      <PropertyFlowSteps flow="buy" active={0} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField select label="Ward" value={ward} onChange={(event) => setWard(event.target.value)} size="small" sx={{ minWidth: 200 }} slotProps={SHOW_EMPTY}>
          <MenuItem value="">All wards</MenuItem>
          {wards.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Type" value={type} onChange={(event) => setType(event.target.value as PropertyType | "")} size="small" sx={{ minWidth: 200 }} slotProps={SHOW_EMPTY}>
          <MenuItem value="">Any type</MenuItem>
          {Object.entries(PROPERTY_TYPE).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button component={RouterLink} to="/property/sell" variant="contained">
          Sell a property
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <CircularProgress aria-label="Loading properties" />}
      {rows && (
        <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 340px" } }}>
          <Stack spacing={1.5}>
          <PlaceMap
            center={center}
            zoom={pins.length > 1 ? 13 : 15}
            fitPins={pins.length > 0}
            height={{ xs: 260, sm: 360, md: 520 }}
            selectedId={selectedId}
            onSelect={setSelectedId}
            pins={pins}
          />
          <LiveWeather latitude={(selected ?? center).latitude} longitude={(selected ?? center).longitude} compact />
          </Stack>
          <Box sx={{ display: "grid", gap: 1.5, alignContent: "start", maxHeight: { md: 520 }, overflowY: { md: "auto" } }}>
            {rows.length === 0 && <Empty>No properties match. Try another ward or type, or sell one yourself.</Empty>}
            {rows.map((row) => (
              <Box key={row.id} onClick={() => setSelectedId(row.id)}>
                <PropertyCard property={row} />
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Stack>
  );
}

function PropertyDetail({ id }: { id: string }) {
  const { user, ready } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<BuyerOffer | null>(null);

  useEffect(() => {
    if (!ready) return;
    apiGet<Property>(`/api/v1/properties/${encodeURIComponent(id)}`)
      .then((payload) => {
        setProperty(payload);
        setAmount(String(payload.price_paise / 100));
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [id, ready]);

  async function offer(event: FormEvent) {
    event.preventDefault();
    const paise = rupeesToPaise(amount);
    if (paise === null) {
      setFields({ amount_paise: "Enter your offer in rupees." });
      return;
    }
    setBusy(true);
    setOfferError(null);
    setFields({});
    try {
      setSent(
        await apiRequest<BuyerOffer>(`/api/v1/properties/${id}/offers`, {
          method: "POST",
          body: { amount_paise: paise, phone, message },
        }),
      );
    } catch (reason) {
      setOfferError(errorMessage(reason));
      setFields(fieldErrors(reason));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Alert severity="error">{error}</Alert>
        <Button component={RouterLink} to="/property">
          Back to properties
        </Button>
      </Stack>
    );
  }
  if (!property) return <CircularProgress aria-label="Loading property" />;

  return (
    <Stack spacing={2.5}>
      <PropertyFlowSteps flow="buy" active={property.mine ? 0 : sent ? 2 : 1} />
      <Button component={RouterLink} to="/property" sx={{ alignSelf: "flex-start" }}>
        ← All properties
      </Button>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 380px" }, alignItems: "start" }}>
        <Box sx={[surfaceSx, { p: 0, overflow: "hidden" }]}>
          {Boolean(property.image || property.media?.length) && (
            <Box sx={{ p: { xs: 1, sm: 1.5 }, pb: 0 }}>
              <MediaGallery
                title={property.title}
                height={440}
                items={[...(property.image ? [{ key: "legacy-image", kind: "image" as const, url: property.image }] : []), ...galleryOf(property.media)]}
              />
            </Box>
          )}
          <Stack spacing={1} sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
              <Typography variant="h1">{property.title}</Typography>
              <StatusChip status={property.status} />
            </Stack>
            <Typography sx={{ fontFamily: '"Outfit", sans-serif', fontSize: "1.75rem", fontWeight: 700 }}>{propertyPrice(property.price_paise)}</Typography>
            <PropertyFacts property={property} />
            <Typography color="text.secondary">{property.address_text}</Typography>
            <Typography sx={{ whiteSpace: "pre-line" }}>{property.description}</Typography>
            <ListerLine property={property} />
            {property.contact_phone && <Typography variant="body2">Contact on file: {property.contact_phone}</Typography>}
            {property.latitude != null && property.longitude != null && (
              <>
              <PlaceMap
                center={{ latitude: property.latitude, longitude: property.longitude }}
                zoom={16}
                height={220}
                pins={[
                  {
                    id: property.id,
                    name: property.title,
                    latitude: property.latitude,
                    longitude: property.longitude,
                    color: PROPERTY_PIN,
                    label: PROPERTY_TYPE[property.property_type],
                    detail: propertyPrice(property.price_paise),
                  },
                ]}
              />
              <LiveWeather latitude={property.latitude} longitude={property.longitude} compact />
              </>
            )}
          </Stack>
        </Box>

        <Box sx={surfaceSx}>
          {property.mine ? (
            <Stack spacing={1.5}>
              <Typography variant="h2">This is your listing</Typography>
              <Typography color="text.secondary">Offers from buyers appear on My listings, where you can accept one and mark the sale complete.</Typography>
              <Button component={RouterLink} to="/property/listings" variant="contained">
                Open my listings
              </Button>
            </Stack>
          ) : sent ? (
            <Stack spacing={1.5}>
              <Typography variant="h2">Offer sent</Typography>
              <Typography>
                You offered {propertyPrice(sent.amount_paise)}. The seller gets your phone number and can accept or decline. Their number is shown to you once they accept.
              </Typography>
              <Button component={RouterLink} to="/property/offers" variant="contained">
                Track my offers
              </Button>
            </Stack>
          ) : !user ? (
            <SignInFirst action="make an offer" />
          ) : (
            <Stack component="form" spacing={1.5} onSubmit={offer} noValidate>
              <Typography variant="h2">Make an offer</Typography>
              {property.status === "under_offer" && (
                <Alert severity="info">The seller has accepted another offer. You can still leave a backup offer in case that deal falls through.</Alert>
              )}
              <TextField
                label="Your offer in rupees"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                required
                error={!!fields.amount_paise}
                helperText={fields.amount_paise ?? (rupeesToPaise(amount) ? propertyPrice(rupeesToPaise(amount) ?? 0) : " ")}
              />
              <TextField label="Your phone" value={phone} onChange={(event) => setPhone(event.target.value)} required error={!!fields.phone} helperText={fields.phone ?? "Shared with the seller."} />
              <TextField label="Message to the seller" value={message} onChange={(event) => setMessage(event.target.value)} multiline minRows={2} placeholder="When can you visit? Loan or cash?" />
              {offerError && <Alert severity="error">{offerError}</Alert>}
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? "Sending…" : "Send offer"}
              </Button>
            </Stack>
          )}
        </Box>
      </Box>
    </Stack>
  );
}

function SellTab() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [broker] = useBroker(!!user && !isAdmin);

  if (!ready) return <CircularProgress aria-label="Loading account" />;
  if (!user) return <SignInFirst action="list a property" />;

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
      <Box sx={surfaceSx}>
        <Typography variant="h2" sx={{ mb: 1.5 }}>
          {isAdmin ? "Publish a listing" : "Sell a property"}
        </Typography>
        <PropertyForm isAdmin={isAdmin} brokerVerified={broker?.status === "approved"} onSaved={() => navigate("/property/listings")} />
      </Box>
      <Box sx={insetSurfaceSx}>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>Sell flow</Typography>
        <Stack component="ol" spacing={0.75} sx={{ pl: 2.5, m: 0 }}>
          <Typography component="li" variant="body2">
            {isAdmin ? "Choose city desk or list for an owner. The listing goes live at once." : "Choose owner or broker. Brokers need city verification first."}
          </Typography>
          <Typography component="li" variant="body2">Add details, photos, and a map pin.</Typography>
          <Typography component="li" variant="body2">{isAdmin ? "Publish. Buyers can offer immediately." : "Send for approval. Buyers see it after the city checks it."}</Typography>
          <Typography component="li" variant="body2">Accept one offer on My listings, then mark it sold.</Typography>
        </Stack>
        {isAdmin && (
          <Button component={RouterLink} to="/admin?tab=properties" variant="outlined" sx={{ mt: 1.5 }}>
            Open admin property desk
          </Button>
        )}
      </Box>
    </Box>
  );
}

function ListingsTab() {
  const { user, ready } = useAuth();
  const isAdmin = user?.role === "admin";
  const [broker] = useBroker(!!user && !isAdmin);
  const [rows, setRows] = useState<ManagedProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<{ data: ManagedProperty[] }>(isAdmin ? "/api/v1/properties/manage" : "/api/v1/properties/mine")
      .then((payload) => setRows(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [isAdmin]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!ready) return <CircularProgress aria-label="Loading account" />;
  if (!user) return <SignInFirst action="see your listings" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <CircularProgress aria-label="Loading listings" />;
  if (rows.length === 0) {
    return <Empty>{isAdmin ? "No properties yet. Publish one from Sell, or wait for owners and brokers." : "You have not listed a property yet. Use the Sell tab to add one."}</Empty>;
  }

  return (
    <Stack spacing={1.5}>
      <Alert severity="info">
        {isAdmin
          ? "Seller desk: approve owner and broker listings, accept offers, and mark sales complete. You can also buy from the Buy tab."
          : "Seller desk: accept an offer, share your number with the buyer, then mark the sale complete."}
      </Alert>
      {rows.map((row) => (
        <ManagedListingCard
          key={row.id}
          listing={row}
          asAdmin={isAdmin}
          brokerVerified={broker?.status === "approved"}
          onChange={(next) => setRows((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null)}
          onRemoved={() => setRows((current) => current?.filter((item) => item.id !== row.id) ?? null)}
        />
      ))}
    </Stack>
  );
}

function OffersTab() {
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<BuyerOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiGet<{ data: BuyerOffer[] }>("/api/v1/properties/offers/mine")
      .then((payload) => setRows(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [user]);

  async function withdraw(offer: BuyerOffer) {
    const warning = offer.status === "accepted" ? " The seller has accepted it; withdrawing puts the property back on sale." : "";
    if (!window.confirm(`Withdraw your offer on "${offer.property.title}"?${warning}`)) return;
    setBusy(offer.id);
    setError(null);
    try {
      const next = await apiRequest<BuyerOffer>(`/api/v1/properties/offers/${offer.id}/withdraw`, { method: "POST" });
      setRows((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <CircularProgress aria-label="Loading account" />;
  if (!user) return <SignInFirst action="see your offers" />;
  if (!rows) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading offers" />;
  if (rows.length === 0) return <Empty>You have not made any offers. Open a property on the Buy tab to make one.</Empty>;

  return (
    <Stack spacing={1.5}>
      <PropertyFlowSteps flow="buy" active={2} />
      {error && <Alert severity="error">{error}</Alert>}
      {rows.map((offer) => {
        const chip = OFFER_STATUS[offer.status];
        return (
          <Box key={offer.id} sx={surfaceSx}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{offer.property.title}</Typography>
                  <Chip label={chip.label} color={chip.color} size="small" variant="outlined" />
                </Stack>
                <Typography>
                  You offered {propertyPrice(offer.amount_paise)} · asking {propertyPrice(offer.property.price_paise)}
                </Typography>
                <PropertyFacts property={offer.property} />
                {offer.seller_note && <Typography variant="body2">Seller: “{offer.seller_note}”</Typography>}
                {offer.seller_phone && (
                  <Alert severity="success" sx={{ mt: 1 }}>
                    {offer.status === "completed" ? "Sale completed." : "Accepted."} Call the seller on <strong>{offer.seller_phone}</strong> to arrange the visit and paperwork.
                  </Alert>
                )}
              </Box>
              <Stack direction="row" spacing={1} sx={{ flex: "0 0 auto" }}>
                {(offer.property.status === "approved" || offer.property.status === "under_offer") && (
                  <Button component={RouterLink} to={`/property/${offer.property.id}`}>
                    View
                  </Button>
                )}
                {(offer.status === "pending" || offer.status === "accepted") && (
                  <Button color="error" disabled={busy === offer.id} onClick={() => void withdraw(offer)}>
                    Withdraw
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function BrokerTab() {
  const { user, ready } = useAuth();
  const isAdmin = user?.role === "admin";
  const [broker, setBroker] = useBroker(!!user && !isAdmin);
  const [agency, setAgency] = useState("");
  const [license, setLicense] = useState("");
  const [phone, setPhone] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!broker) return;
    setAgency(broker.agency_name);
    setLicense(broker.license_no);
    setPhone(broker.phone);
    setAbout(broker.about);
  }, [broker]);

  async function apply(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const payload = await apiRequest<{ broker: Broker }>("/api/v1/properties/brokers", {
        method: "POST",
        body: { agency_name: agency, license_no: license, phone, about },
      });
      setBroker(payload.broker);
    } catch (reason) {
      setError(errorMessage(reason));
      setFields(fieldErrors(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <CircularProgress aria-label="Loading account" />;
  if (!user) return <SignInFirst action="apply as a broker" />;
  if (isAdmin) return <Empty>City admins list properties directly and verify brokers from the Admin console.</Empty>;
  if (broker === undefined) return <CircularProgress aria-label="Loading broker status" />;

  const chip = broker ? BROKER_STATUS[broker.status] : null;
  const canApply = !broker || broker.status !== "approved";

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
      <Box sx={surfaceSx}>
        {broker && chip && (
          <Stack spacing={0.75} sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="h2">{broker.agency_name}</Typography>
              <Chip label={chip.label} color={chip.color} size="small" variant={broker.status === "approved" ? "filled" : "outlined"} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Licence {broker.license_no} · {broker.phone}
            </Typography>
            {broker.review_note && <Typography variant="body2">Note from the city: {broker.review_note}</Typography>}
            {broker.status === "approved" && (
              <Button component={RouterLink} to="/property/sell" variant="contained" sx={{ alignSelf: "flex-start", mt: 1 }}>
                List a property for an owner
              </Button>
            )}
          </Stack>
        )}
        {canApply && (
          <Stack component="form" spacing={1.5} onSubmit={apply} noValidate>
            <Typography variant="h2">{broker ? "Update and resubmit" : "Apply to list as a broker"}</Typography>
            <TextField label="Agency name" value={agency} onChange={(event) => setAgency(event.target.value)} required error={!!fields.agency_name} helperText={fields.agency_name} />
            <TextField label="RERA / licence number" value={license} onChange={(event) => setLicense(event.target.value)} required error={!!fields.license_no} helperText={fields.license_no} />
            <TextField label="Office phone" value={phone} onChange={(event) => setPhone(event.target.value)} required error={!!fields.phone} helperText={fields.phone} />
            <TextField label="About your agency" value={about} onChange={(event) => setAbout(event.target.value)} multiline minRows={2} />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: "flex-start" }}>
              {busy ? "Sending…" : "Send for verification"}
            </Button>
          </Stack>
        )}
      </Box>
      <Box sx={insetSurfaceSx}>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>Why verify?</Typography>
        <Typography variant="body2">
          Brokers list properties on behalf of owners. The city checks your licence so buyers know who they are dealing with. Verified brokers get a badge and can show their brokerage on each listing.
        </Typography>
      </Box>
    </Box>
  );
}
