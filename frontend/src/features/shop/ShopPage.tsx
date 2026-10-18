import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { apiGet, apiRequest, errorMessage, fieldErrors } from "../../api/client";
import type { BusinessProfile, CityMap, MapPlace } from "../../api/types";
import { kickerSx, linkSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { useFeatures } from "../admin/FeatureContext";
import { STATUS_CHIP } from "../admin/status";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath, useRegisterPath } from "../auth/paths";
import { LiveWeather } from "../city/LiveWeather";
import { minutes, rupees, servicePrice, SHOP_CATEGORY } from "../city/labels";
import { useWard } from "../city/WardContext";
import { incomingCommerceOrders } from "../orders/api";
import { OrdersDesk, useIncomingOrders } from "../orders/OrdersDesk";
import { PlaceMap } from "../map/PlaceMap";
import { coverUrl, draftsFrom, hasCoverImage, mediaIds, type MediaDraft } from "../media/api";
import { galleryOf, MediaDialogButton } from "../media/MediaGallery";
import { MediaManager } from "../media/MediaManager";
import { ItemThumb } from "./ItemPhoto";
import { ShopQr } from "./ShopQr";

const CATEGORIES = Object.entries(SHOP_CATEGORY);
const MAX_SHOP_MEDIA = 10;
const MAX_ITEM_MEDIA = 6;
type OnboardStep = "details" | "catalog" | "services" | "map" | "review";

const ONBOARD_STEPS: OnboardStep[] = ["details", "catalog", "services", "map", "review"];
const GROCERY_STEPS: OnboardStep[] = ["details", "map", "catalog", "services", "review"];
const STEP_LABEL: Record<OnboardStep, string> = {
  details: "Details",
  catalog: "Catalog",
  services: "Services",
  map: "Map",
  review: "Review",
};

type DraftItem = {
  key: string;
  name: string;
  description: string;
  price: string;
  available: boolean;
  media: MediaDraft[];
};

type DraftService = {
  key: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  available: boolean;
};

let draftKey = 0;

function blankItem(): DraftItem {
  draftKey += 1;
  return { key: `item-${draftKey}`, name: "", description: "", price: "", available: true, media: [] };
}

function blankService(): DraftService {
  draftKey += 1;
  return { key: `service-${draftKey}`, name: "", description: "", price: "", duration: "", available: true };
}

type ShopScreen =
  | { kind: "nearby" }
  | { kind: "mine" }
  | { kind: "orders" }
  | { kind: "new" }
  | { kind: "desk"; slug: string }
  | { kind: "missing" };

function parseScreen(splat: string): ShopScreen {
  const path = splat.replace(/\/$/, "");
  if (path === "") return { kind: "nearby" };
  if (path === "mine") return { kind: "mine" };
  if (path === "orders") return { kind: "orders" };
  if (path === "new") return { kind: "new" };
  if (path.startsWith("desk/")) {
    const slug = decodeURIComponent(path.slice("desk/".length));
    if (slug && !slug.includes("/")) return { kind: "desk", slug };
  }
  return { kind: "missing" };
}

export default function ShopPage() {
  const { user, ready } = useAuth();
  const { isEnabled } = useFeatures();
  const { wards, wardId } = useWard();
  const navigate = useNavigate();
  const splat = useParams()["*"] ?? "";
  const screen = parseScreen(splat);
  const [map, setMap] = useState<CityMap | null>(null);
  const [directory, setDirectory] = useState<MapPlace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mine, setMine] = useState<BusinessProfile[] | null>(null);
  const [requests, setRequests] = useState<BusinessProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wardId) return;
    let active = true;
    apiGet<CityMap>(`/api/v1/city/map?ward_id=${encodeURIComponent(wardId)}`)
      .then((payload) => {
        if (!active) return;
        setMap(payload);
        setDirectory(payload.places.filter((place) => place.kind === "business"));
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [wardId]);

  const admin = user?.role === "admin";

  useEffect(() => {
    if (!admin) {
      setMine([]);
      return;
    }
    let active = true;
    apiGet<{ data: BusinessProfile[] }>("/api/v1/businesses/mine")
      .then((payload) => {
        if (active) setMine(payload.data);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [admin]);

  useEffect(() => {
    if (!ready || !user || admin) {
      setRequests(admin ? [] : null);
      return;
    }
    let active = true;
    apiGet<{ data: BusinessProfile[] }>("/api/v1/businesses/requests/mine")
      .then((payload) => {
        if (active) setRequests(payload.data);
      })
      .catch(() => {
        if (active) setRequests([]);
      });
    return () => {
      active = false;
    };
  }, [ready, user, admin]);

  if (!ready) return <CircularProgress aria-label="Loading account" />;

  const listingsOpen = isEnabled("shop_requests");
  const pendingCount = mine?.filter((shop) => shop.status === "pending").length ?? 0;
  const tab =
    screen.kind === "nearby" || screen.kind === "mine" || screen.kind === "orders" || screen.kind === "new" ? screen.kind : false;
  const title =
    screen.kind === "nearby"
      ? "Nearby shops"
      : screen.kind === "mine"
        ? admin
          ? "All shops"
          : "Your shops"
        : screen.kind === "orders"
          ? "Shop orders"
          : screen.kind === "new"
            ? admin
              ? "Add a shop"
              : "List your shop"
            : screen.kind === "desk"
              ? "Shop desk"
              : "Shops";
  const subtitle =
    screen.kind === "nearby"
      ? "Shops listed in this ward. Open a card for hours, catalog, and the public profile."
      : screen.kind === "mine"
        ? admin
          ? "Open a shop to edit its catalog, services, and QR code."
          : "Listings you have sent to the city admin."
        : screen.kind === "orders"
          ? admin
            ? "Accept grocery and food orders, then move them through packing and delivery."
            : "Orders placed at shops you own. Accept them, pack them, and mark them delivered."
          : screen.kind === "new"
            ? admin
              ? "Step through the shop details, what it sells, and where it sits on the map."
              : "Send your shop for review. It appears on the map after a city admin approves it."
            : screen.kind === "desk"
              ? "Catalog, services, and the code for this shop."
              : "That shop screen does not exist.";

  function remember(shop: BusinessProfile) {
    setMine((rows) => [shop, ...(rows ?? []).filter((row) => row.id !== shop.id)]);
    setDirectory((rows) => [
      {
        id: shop.id,
        kind: "business",
        subtype: shop.category,
        name: shop.name,
        address_text: shop.address_text,
        detail: shop.opening_hours,
        latitude: shop.latitude,
        longitude: shop.longitude,
        href: shop.profile_path,
      },
      ...rows.filter((row) => row.id !== shop.id),
    ]);
  }

  const deskShop = screen.kind === "desk" ? mine?.find((shop) => shop.slug === screen.slug) : undefined;

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography sx={kickerSx}>Shops</Typography>
        <Typography variant="h1">{title}</Typography>
        <Typography color="text.secondary">{subtitle}</Typography>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={(_event, next: "nearby" | "mine" | "orders" | "new") => navigate(next === "nearby" ? "/shop" : `/shop/${next}`)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Shop screens"
        >
          <Tab value="nearby" label="Nearby" sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }} />
          <Tab value="mine" label={admin ? "All shops" : "Your shops"} sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }} />
          {(admin || user) && (
            <Tab value="orders" label="Orders" sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }} />
          )}
          <Tab value="new" label={admin ? "Add a shop" : "List a shop"} sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }} />
        </Tabs>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {screen.kind === "nearby" && (
        <NearbyScreen map={map} directory={directory} selectedId={selectedId} onSelect={setSelectedId} />
      )}

      {screen.kind === "mine" && admin && pendingCount > 0 && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" component={RouterLink} to="/admin?tab=approvals">
              Review
            </Button>
          }
        >
          {pendingCount} {pendingCount === 1 ? "shop is" : "shops are"} waiting for approval.
        </Alert>
      )}

      {screen.kind === "mine" && admin && (
        <ShopIndex
          shops={mine}
          empty="No shops yet. Add the first one from the next screen."
          action={
            <Button component={RouterLink} to="/shop/new" variant="contained">
              Add a shop
            </Button>
          }
        />
      )}

      {screen.kind === "mine" && !admin && (
        <ResidentShops requests={user ? requests : []} signedIn={Boolean(user)} listingsOpen={listingsOpen} />
      )}

      {screen.kind === "orders" && <ShopOrdersScreen admin={admin} signedIn={Boolean(user)} />}

      {screen.kind === "new" && admin && (
        <OnboardForm wards={wards} defaultWardId={user?.ward_id || wardId} onCreated={remember} />
      )}

      {screen.kind === "new" && !admin && !user && <SignInPrompt />}

      {screen.kind === "new" && !admin && user && !listingsOpen && (
        <Alert severity="info">New shop listings are paused by the city admin. Please check back later.</Alert>
      )}

      {screen.kind === "new" && !admin && user && listingsOpen && (
        <OnboardForm
          mode="request"
          wards={wards}
          defaultWardId={user.ward_id || wardId}
          onCreated={(shop) => setRequests((rows) => [shop, ...(rows ?? [])])}
        />
      )}

      {screen.kind === "desk" && !admin && (
        <Alert severity="info">Shop editing is on the city admin desk.</Alert>
      )}

      {screen.kind === "desk" && admin && mine === null && <CircularProgress aria-label="Loading shops" />}

      {screen.kind === "desk" && admin && mine && !deskShop && (
        <Alert severity="warning">
          That shop is not on your desk. <RouterLink to="/shop/mine">Back to all shops</RouterLink>
        </Alert>
      )}

      {screen.kind === "desk" && admin && deskShop && (
        <Stack spacing={1.5}>
          <Button component={RouterLink} to="/shop/mine" sx={{ alignSelf: "flex-start" }}>
            All shops
          </Button>
          <OwnedShop
            shop={deskShop}
            onChange={(next) => setMine((rows) => rows?.map((row) => (row.id === next.id ? next : row)) ?? null)}
            onRemoved={() => {
              setMine((rows) => rows?.filter((row) => row.id !== deskShop.id) ?? null);
              setDirectory((rows) => rows.filter((row) => row.id !== deskShop.id && row.href !== deskShop.profile_path));
              navigate("/shop/mine");
            }}
          />
        </Stack>
      )}

      {screen.kind === "missing" && (
        <Button component={RouterLink} to="/shop" variant="contained" sx={{ alignSelf: "flex-start" }}>
          Nearby shops
        </Button>
      )}
    </Stack>
  );
}

function NearbyScreen({
  map,
  directory,
  selectedId,
  onSelect,
}: {
  map: CityMap | null;
  directory: MapPlace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = directory.find((shop) => shop.id === selectedId);

  if (!map) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Loading shops" />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 340px" } }}>
      <Stack spacing={1.5}>
      <PlaceMap
        center={map.center}
        zoom={map.zoom}
        height={{ xs: 260, sm: 360, md: 520 }}
        selectedId={selectedId}
        onSelect={onSelect}
        pins={directory.map((shop) => ({
          id: shop.id,
          name: shop.name,
          latitude: shop.latitude,
          longitude: shop.longitude,
          color: "#0f766e",
          label: SHOP_CATEGORY[shop.subtype] ?? shop.subtype,
          detail: shop.detail,
          href: shop.href,
        }))}
      />
      <LiveWeather
        latitude={(selected ?? map.center).latitude}
        longitude={(selected ?? map.center).longitude}
        compact
      />
      </Stack>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          alignContent: "start",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr" },
          maxHeight: { md: 520 },
          overflowY: { md: "auto" },
        }}
      >
        {directory.length === 0 && <Typography color="text.secondary">No shops are listed in this ward yet.</Typography>}
        {directory.map((shop) => (
          <Box
            key={shop.id}
            component={shop.href ? RouterLink : "div"}
            to={shop.href ?? undefined}
            onClick={() => onSelect(shop.id)}
            sx={shop.href ? linkSurfaceSx : surfaceSx}
          >
            <Typography sx={{ fontWeight: 700 }}>{shop.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {SHOP_CATEGORY[shop.subtype] ?? shop.subtype}
            </Typography>
            <Typography>{shop.address_text}</Typography>
            <Typography variant="body2" color="text.secondary">
              {shop.detail}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ShopIndex({
  shops,
  empty,
  action,
}: {
  shops: BusinessProfile[] | null;
  empty: string;
  action: ReactNode;
}) {
  if (!shops) return <CircularProgress aria-label="Loading shops" />;
  if (shops.length === 0) {
    return (
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Typography color="text.secondary">{empty}</Typography>
        {action}
      </Stack>
    );
  }
  return (
    <Stack spacing={1.5}>
      {shops.map((shop) => {
        const chip = STATUS_CHIP[shop.status];
        return (
          <Box key={shop.id} component={RouterLink} to={`/shop/desk/${shop.slug}`} sx={linkSurfaceSx}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <ItemThumb src={coverUrl(shop.media)} alt={shop.name} size={56} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>{shop.name}</Typography>
                  <Chip label={chip.label} color={chip.color} size="small" variant={shop.status === "approved" ? "filled" : "outlined"} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {SHOP_CATEGORY[shop.category] ?? shop.category} · {shop.ward_name} · {shop.opening_hours}
                </Typography>
              </Box>
            </Stack>
          </Box>
        );
      })}
      <Box>{action}</Box>
    </Stack>
  );
}

function ShopOrdersScreen({ admin, signedIn }: { admin: boolean; signedIn: boolean }) {
  const load = useCallback(async () => (await incomingCommerceOrders()).data, []);
  const { orders, error, reload } = useIncomingOrders(load);
  if (!signedIn) return <SignInPrompt />;
  return (
    <OrdersDesk
      orders={orders}
      error={error}
      empty={
        admin
          ? "No grocery or food orders yet. New checkouts wait here for acceptance."
          : "No orders for your shops yet. After a listing is approved, resident orders show up here."
      }
      onReload={reload}
      admin={admin}
    />
  );
}

function ResidentShops({
  requests,
  signedIn,
  listingsOpen,
}: {
  requests: BusinessProfile[] | null;
  signedIn: boolean;
  listingsOpen: boolean;
}) {
  if (!signedIn) return <SignInPrompt />;
  if (!requests) return <CircularProgress aria-label="Loading your shops" />;
  return (
    <Stack spacing={1.5}>
      {requests.length === 0 && <Typography color="text.secondary">You have not sent a shop for listing yet.</Typography>}
      {requests.map((shop) => {
        const chip = STATUS_CHIP[shop.status];
        return (
          <Box key={shop.id} sx={[surfaceSx, { display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }]}>
            <ItemThumb src={coverUrl(shop.media)} alt={shop.name} size={56} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>{shop.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {SHOP_CATEGORY[shop.category] ?? shop.category} · {shop.ward_name}
              </Typography>
              {shop.review_note && <Typography variant="body2">Admin note: {shop.review_note}</Typography>}
            </Box>
            <Chip label={chip.label} color={chip.color} size="small" variant={shop.status === "approved" ? "filled" : "outlined"} />
            {shop.status === "approved" && (
              <Button component={RouterLink} to={shop.profile_path} size="small">
                View profile
              </Button>
            )}
          </Box>
        );
      })}
      {listingsOpen ? (
        <Button component={RouterLink} to="/shop/new" variant="contained" sx={{ alignSelf: "flex-start" }}>
          List a shop
        </Button>
      ) : (
        <Alert severity="info">New shop listings are paused by the city admin. Please check back later.</Alert>
      )}
    </Stack>
  );
}

function SignInPrompt() {
  const signIn = useLoginPath();
  const register = useRegisterPath();
  return (
    <Box sx={surfaceSx}>
      <Typography sx={{ fontWeight: 700 }}>Own a shop?</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
        Sign in to send your shop for listing. A city admin reviews it before it appears on the map.
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button component={RouterLink} to={signIn} variant="contained">
          Sign in
        </Button>
        <Button component={RouterLink} to={register}>
          Create account
        </Button>
      </Stack>
    </Box>
  );
}

function OwnedShop({
  shop,
  onChange,
  onRemoved,
}: {
  shop: BusinessProfile;
  onChange: (shop: BusinessProfile) => void;
  onRemoved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [shopMedia, setShopMedia] = useState<MediaDraft[]>(() => draftsFrom(shop.media));
  const [uploading, setUploading] = useState(false);
  const [shopUploading, setShopUploading] = useState(false);
  const [savingShopMedia, setSavingShopMedia] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addItem() {
    const pricePaise = toPaise(price);
    if (!name.trim() || pricePaise === null) {
      setItemError("Add an item name and a price in rupees.");
      return;
    }
    if (!hasCoverImage(media)) {
      setItemError("Add at least one photo of the item.");
      return;
    }
    setBusy(true);
    setItemError(null);
    try {
      const next = await apiRequest<BusinessProfile>(`/api/v1/businesses/${shop.slug}/items`, {
        method: "POST",
        body: { name: name.trim(), description: description.trim(), price_paise: pricePaise, is_available: true, media: mediaIds(media) },
      });
      onChange(next);
      setName("");
      setDescription("");
      setPrice("");
      setMedia([]);
    } catch (reason) {
      setItemError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveShopMedia() {
    if (!hasCoverImage(shopMedia)) {
      setItemError("Keep at least one shop photo.");
      return;
    }
    setSavingShopMedia(true);
    setItemError(null);
    try {
      onChange(
        await apiRequest<BusinessProfile>(`/api/v1/businesses/${shop.slug}/media`, {
          method: "PATCH",
          body: { media: mediaIds(shopMedia) },
        }),
      );
    } catch (reason) {
      setItemError(errorMessage(reason));
    } finally {
      setSavingShopMedia(false);
    }
  }

  async function remove(path: string) {
    setBusy(true);
    setItemError(null);
    try {
      await apiRequest<void>(`/api/v1/businesses/${shop.slug}/${path}`, { method: "DELETE" });
      const removedId = path.split("/")[1];
      onChange({
        ...shop,
        catalog: shop.catalog.filter((item) => item.id !== removedId),
        services: shop.services.filter((service) => service.id !== removedId),
      });
    } catch (reason) {
      setItemError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const lastListing = shop.catalog.length + shop.services.length === 1;

  async function removeShop() {
    if (!window.confirm(`Remove ${shop.name} from the map and its public profile?`)) return;
    setBusy(true);
    setItemError(null);
    try {
      await apiRequest<void>(`/api/v1/businesses/${shop.slug}`, { method: "DELETE" });
      onRemoved();
    } catch (reason) {
      setItemError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <Box sx={[surfaceSx, { display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 280px" } }]}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 700 }}>{shop.name}</Typography>
          <Chip
            label={STATUS_CHIP[shop.status].label}
            color={STATUS_CHIP[shop.status].color}
            size="small"
            variant={shop.status === "approved" ? "filled" : "outlined"}
          />
        </Stack>
        <Typography color="text.secondary">
          {SHOP_CATEGORY[shop.category] ?? shop.category} · {shop.ward_name} · {shop.opening_hours}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button component={RouterLink} to={shop.profile_path}>
            Open public profile
          </Button>
          <Button color="error" disabled={busy} onClick={() => void removeShop()}>
            Remove shop
          </Button>
        </Stack>
        <MediaManager
          value={shopMedia}
          onChange={setShopMedia}
          onError={setItemError}
          onBusyChange={setShopUploading}
          max={MAX_SHOP_MEDIA}
          title="Shop photos and videos"
          hint={`Required. Up to ${MAX_SHOP_MEDIA}. The shopfront, the inside, and a short tour. The first photo is the cover.`}
          required
          disabled={busy || savingShopMedia}
        />
        <Button
          variant="outlined"
          disabled={busy || shopUploading || savingShopMedia}
          onClick={() => void saveShopMedia()}
          sx={{ alignSelf: "flex-start" }}
        >
          {shopUploading ? "Uploading…" : savingShopMedia ? "Saving…" : "Save shop photos"}
        </Button>
        <Typography sx={{ fontWeight: 700 }}>Catalog</Typography>
        {shop.catalog.length === 0 && <Typography color="text.secondary">No catalog items yet.</Typography>}
        {shop.catalog.map((item) => (
          <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
              <ItemThumb src={item.image ?? coverUrl(item.media)} alt={item.name} size={40} />
              <Typography>
                {item.name} · {rupees(item.price_paise)}
              </Typography>
              <MediaDialogButton items={galleryOf(item.media)} title={item.name} />
            </Stack>
            <Button size="small" disabled={busy || lastListing} onClick={() => void remove(`items/${item.id}`)}>
              Remove
            </Button>
          </Stack>
        ))}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
          <TextField label="New item" value={name} onChange={(event) => setName(event.target.value)} size="small" />
          <TextField label="Note" value={description} onChange={(event) => setDescription(event.target.value)} size="small" />
          <TextField label="₹" value={price} onChange={(event) => setPrice(event.target.value)} size="small" sx={{ maxWidth: 120 }} />
          <Button variant="outlined" disabled={busy || uploading} onClick={() => void addItem()}>
            {uploading ? "Uploading…" : "Add"}
          </Button>
        </Stack>
        <MediaManager
          value={media}
          onChange={setMedia}
          onError={setItemError}
          onBusyChange={setUploading}
          max={MAX_ITEM_MEDIA}
          title="Photos and videos of the new item"
          hint={`Required. Up to ${MAX_ITEM_MEDIA}. The first photo is the cover shoppers see.`}
          required
          disabled={busy}
        />
        <OwnedServices shop={shop} busy={busy} lastListing={lastListing} onRemove={(id) => void remove(`services/${id}`)} onChange={onChange} />
        {itemError && <Alert severity="error">{itemError}</Alert>}
      </Stack>
      <ShopQr path={shop.profile_path} name={shop.name} />
    </Box>
  );
}

function OwnedServices({
  shop,
  busy,
  lastListing,
  onRemove,
  onChange,
}: {
  shop: BusinessProfile;
  busy: boolean;
  lastListing: boolean;
  onRemove: (serviceId: string) => void;
  onChange: (shop: BusinessProfile) => void;
}) {
  const [draft, setDraft] = useState<DraftService>(blankService);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addService() {
    const body = toService(draft);
    if (typeof body === "string") {
      setError(body);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await apiRequest<BusinessProfile>(`/api/v1/businesses/${shop.slug}/services`, { method: "POST", body });
      onChange(next);
      setDraft(blankService());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontWeight: 700 }}>Services</Typography>
      {shop.services.length === 0 && (
        <Typography color="text.secondary">No services yet. Add repairs, bookings, delivery, or anything else you offer.</Typography>
      )}
      {shop.services.map((service) => (
        <Stack key={service.id} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography>
            {service.name} · {servicePrice(service.price_paise)}
            {service.duration_minutes !== null && ` · ${minutes(service.duration_minutes)}`}
          </Typography>
          <Button size="small" disabled={busy || saving || lastListing} onClick={() => onRemove(service.id)}>
            Remove
          </Button>
        </Stack>
      ))}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField label="New service" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} size="small" />
        <TextField label="Note" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} size="small" />
        <TextField label="₹ (optional)" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} size="small" sx={{ maxWidth: 130 }} />
        <TextField label="Minutes" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} size="small" sx={{ maxWidth: 110 }} />
        <Button variant="outlined" disabled={busy || saving} onClick={() => void addService()}>
          Add
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function OnboardForm({
  wards,
  defaultWardId,
  onCreated,
  mode = "admin",
}: {
  wards: { id: string; name: string }[];
  defaultWardId: string;
  onCreated: (shop: BusinessProfile) => void;
  mode?: "admin" | "request";
}) {
  const request = mode === "request";
  const [name, setName] = useState("");
  const [category, setCategory] = useState("grocery");
  const [ward, setWard] = useState(defaultWardId);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("8:00–21:00");
  const [about, setAbout] = useState("");
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [services, setServices] = useState<DraftService[]>([]);
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [placed, setPlaced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<BusinessProfile | null>(null);
  const [step, setStep] = useState(0);
  const [shopMedia, setShopMedia] = useState<MediaDraft[]>([]);
  const [uploads, setUploads] = useState<Record<string, boolean>>({});
  const uploading = Object.values(uploads).some(Boolean);
  const trackUpload = (key: string) => (active: boolean) =>
    setUploads((current) => (Boolean(current[key]) === active ? current : { ...current, [key]: active }));
  const hasPhoto = (item: DraftItem) => hasCoverImage(item.media);

  useEffect(() => {
    if (!ward || placed) return;
    let active = true;
    apiGet<CityMap>(`/api/v1/city/map?ward_id=${encodeURIComponent(ward)}`)
      .then((payload) => {
        if (active && !placed) setPoint(payload.center);
      })
      .catch(() => {
        if (active && !placed) setPoint({ latitude: 12.9716, longitude: 77.5946 });
      });
    return () => {
      active = false;
    };
  }, [ward, placed]);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function updateService(key: string, patch: Partial<DraftService>) {
    setServices((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  const grocery = category === "grocery";
  const steps = grocery ? GROCERY_STEPS : ONBOARD_STEPS;
  const current = steps[Math.min(step, steps.length - 1)];

  async function submit() {
    const filled = items.filter((item) => item.name.trim() || item.description.trim() || item.price.trim() || item.media.length);
    if (filled.some((item) => !hasPhoto(item))) {
      setFormError("Add a photo for every catalog item.");
      return;
    }
    if (!hasCoverImage(shopMedia)) {
      setFormError("Add at least one shop photo.");
      return;
    }
    const catalog = filled.map((item) => ({
      name: item.name.trim(),
      description: item.description.trim(),
      price_paise: toPaise(item.price),
      is_available: item.available,
      media: mediaIds(item.media),
    }));
    const offered = services
      .filter((service) => service.name.trim() || service.description.trim() || service.price.trim() || service.duration.trim())
      .map(toService);
    if (!point || catalog.some((item) => !item.name || item.price_paise === null)) {
      setFormError("Name the shop, place it on the map, and give every catalog row a name and a price.");
      return;
    }
    const serviceProblem = offered.find((service) => typeof service === "string");
    if (typeof serviceProblem === "string") {
      setFormError(serviceProblem);
      return;
    }
    if (catalog.length === 0 && offered.length === 0) {
      setFormError("List at least one catalog item or service.");
      return;
    }
    setBusy(true);
    setFormError(null);
    setErrors({});
    try {
      const shop = await apiRequest<BusinessProfile>(request ? "/api/v1/businesses/requests" : "/api/v1/businesses", {
        method: "POST",
        body: {
          name: name.trim(),
          category,
          ward_id: ward,
          address_text: address.trim(),
          phone: phone.trim(),
          opening_hours: hours.trim(),
          about: about.trim(),
          latitude: point.latitude,
          longitude: point.longitude,
          catalog,
          services: offered,
          media: mediaIds(shopMedia),
        },
      });
      setCreated(shop);
      onCreated(shop);
      setName("");
      setAddress("");
      setPhone("");
      setAbout("");
      setShopMedia([]);
      setItems([blankItem()]);
      setServices([]);
      setPlaced(false);
      setStep(0);
    } catch (reason) {
      const mapped = fieldErrors(reason);
      setErrors(mapped);
      setFormError(errorMessage(reason));
      if (Object.keys(mapped).some((field) => !field.startsWith("catalog") && !field.startsWith("services"))) setStep(0);
    } finally {
      setBusy(false);
    }
  }

  function problemFor(key: OnboardStep) {
    if (key === "details") {
      if (!name.trim()) return "Enter the shop name.";
      if (!ward) return "Choose a ward.";
      if (!address.trim()) return "Enter the address.";
      if (!hours.trim()) return "Enter the opening hours.";
      if (about.trim().length < 8) return "Write a short sentence about the shop.";
      if (!hasCoverImage(shopMedia)) return "Add at least one shop photo.";
    }
    if (key === "catalog") {
      for (const item of items) {
        const touched = item.name.trim() || item.description.trim() || item.price.trim() || item.media.length;
        if (touched && (!item.name.trim() || toPaise(item.price) === null)) {
          return "Give every catalog row a name and a price, or clear it.";
        }
        if (touched && !hasPhoto(item)) return `Add a photo for ${item.name.trim() || "each item"}.`;
      }
      if (grocery && !items.some((item) => item.name.trim())) return "Add at least one item the shop sells.";
    }
    if (key === "services") {
      for (const service of services) {
        const touched = service.name.trim() || service.description.trim() || service.price.trim() || service.duration.trim();
        if (!touched) continue;
        const body = toService(service);
        if (typeof body === "string") return body;
      }
    }
    if (key === "map" && !point) return "Wait for the map, then place the shop.";
    return null;
  }

  function continueStep() {
    const problem = problemFor(current);
    if (problem) {
      setFormError(problem);
      return;
    }
    if (current === "services") {
      const catalogCount = items.filter((item) => item.name.trim()).length;
      const serviceCount = services.filter((service) => service.name.trim()).length;
      if (catalogCount + serviceCount === 0) {
        setFormError("List at least one catalog item or service.");
        return;
      }
    }
    setFormError(null);
    setStep((current) => current + 1);
  }

  if (created) {
    return (
      <Stack spacing={2}>
        <Alert severity="success">
          {request ? (
            `${created.name} was sent for approval. You can follow it under Your shops.`
          ) : (
            <>
              {created.name} is on the map. The code opens <RouterLink to={created.profile_path}>{created.name}</RouterLink>.
            </>
          )}
        </Alert>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {request ? (
            <Button component={RouterLink} to="/shop/mine" variant="contained">
              Your shops
            </Button>
          ) : (
            <Button component={RouterLink} to={`/shop/desk/${created.slug}`} variant="contained">
              Open shop desk
            </Button>
          )}
          {!request && (
            <Button component={RouterLink} to={created.profile_path}>
              Public profile
            </Button>
          )}
          <Button
            onClick={() => {
              setCreated(null);
              setStep(0);
            }}
          >
            {request ? "List another" : "Add another"}
          </Button>
        </Stack>
      </Stack>
    );
  }

  const listedItems = items.filter((item) => item.name.trim());
  const listedServices = services.filter((service) => service.name.trim());

  return (
    <Stack spacing={2.5}>
      <Stepper activeStep={step} alternativeLabel>
        {steps.map((key) => (
          <Step key={key}>
            <StepLabel>{grocery && key === "catalog" ? "Items" : STEP_LABEL[key]}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {current === "details" && (
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField label="Shop name" value={name} onChange={(event) => setName(event.target.value)} error={Boolean(errors.name)} helperText={errors.name} required />
        <TextField select label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
          {CATEGORIES.map(([id, label]) => (
            <MenuItem key={id} value={id}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Ward"
          value={ward}
          onChange={(event) => {
            setWard(event.target.value);
            setPlaced(false);
          }}
          error={Boolean(errors.ward_id)}
          helperText={errors.ward_id}
        >
          {wards.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} error={Boolean(errors.phone)} helperText={errors.phone} />
        <TextField label="Address" value={address} onChange={(event) => setAddress(event.target.value)} error={Boolean(errors.address_text)} helperText={errors.address_text} required sx={{ gridColumn: { sm: "1 / -1" } }} />
        <TextField label="Hours" value={hours} onChange={(event) => setHours(event.target.value)} error={Boolean(errors.opening_hours)} helperText={errors.opening_hours} />
        <TextField label="About the shop" value={about} onChange={(event) => setAbout(event.target.value)} error={Boolean(errors.about)} helperText={errors.about || "At least a short sentence."} required multiline minRows={2} sx={{ gridColumn: { sm: "1 / -1" } }} />
        <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
          <MediaManager
            value={shopMedia}
            onChange={setShopMedia}
            onError={setFormError}
            onBusyChange={trackUpload("shop")}
            max={MAX_SHOP_MEDIA}
            title="Shop photos and videos"
            hint={`Required. Up to ${MAX_SHOP_MEDIA}. The shopfront, the inside, and a short tour help people find you. The first photo is the cover.`}
            required
            disabled={busy}
          />
        </Box>
      </Box>
      )}
      {current === "catalog" && (
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700 }}>{grocery ? `Items at ${name.trim() || "the shop"}` : "Catalog"}</Typography>
        <Typography color="text.secondary">
          {grocery
            ? "Add each item with a photo, a price, and a note such as the pack size."
            : "Items the shop sells. You can skip this if you only offer services. Each listed item needs a photo."}
        </Typography>
        {items.map((item, index) => (
          <Stack key={item.key} spacing={1}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
              <TextField label={`Item ${index + 1}`} value={item.name} onChange={(event) => updateItem(item.key, { name: event.target.value })} size="small" sx={{ flex: 1 }} />
              <TextField label="Note" value={item.description} onChange={(event) => updateItem(item.key, { description: event.target.value })} size="small" sx={{ flex: 1 }} />
              <TextField label="Price ₹" value={item.price} onChange={(event) => updateItem(item.key, { price: event.target.value })} size="small" sx={{ width: { sm: 120 } }} />
              <FormControlLabel
                control={<Checkbox checked={item.available} onChange={(event) => updateItem(item.key, { available: event.target.checked })} />}
                label="Available"
              />
              <Button onClick={() => setItems((rows) => rows.filter((row) => row.key !== item.key))}>
                Remove
              </Button>
            </Stack>
            <MediaManager
              value={item.media}
              onChange={(media) => setItems((rows) => rows.map((row) => (row.key === item.key ? { ...row, media } : row)))}
              onError={setFormError}
              onBusyChange={trackUpload(item.key)}
              max={MAX_ITEM_MEDIA}
              title={`Photos and videos of ${item.name.trim() || `item ${index + 1}`}`}
              hint={`Required for each listed item. Up to ${MAX_ITEM_MEDIA}.`}
              required
              disabled={busy}
            />
          </Stack>
        ))}
        <Button sx={{ alignSelf: "flex-start" }} onClick={() => setItems((rows) => [...rows, blankItem()])}>
          Add catalog item
        </Button>
      </Stack>
      )}
      {current === "services" && (
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700 }}>Services</Typography>
        <Typography color="text.secondary">
          Repairs, appointments, delivery, tailoring — anything you do rather than sell. Price and duration are optional.
        </Typography>
        {services.map((service, index) => (
          <Stack key={service.key} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
            <TextField label={`Service ${index + 1}`} value={service.name} onChange={(event) => updateService(service.key, { name: event.target.value })} size="small" sx={{ flex: 1 }} />
            <TextField label="Note" value={service.description} onChange={(event) => updateService(service.key, { description: event.target.value })} size="small" sx={{ flex: 1 }} />
            <TextField label="Price ₹" value={service.price} onChange={(event) => updateService(service.key, { price: event.target.value })} size="small" sx={{ width: { sm: 110 } }} />
            <TextField label="Minutes" value={service.duration} onChange={(event) => updateService(service.key, { duration: event.target.value })} size="small" sx={{ width: { sm: 100 } }} />
            <FormControlLabel
              control={<Checkbox checked={service.available} onChange={(event) => updateService(service.key, { available: event.target.checked })} />}
              label="Offered"
            />
            <Button onClick={() => setServices((rows) => rows.filter((row) => row.key !== service.key))}>Remove</Button>
          </Stack>
        ))}
        <Button sx={{ alignSelf: "flex-start" }} onClick={() => setServices((rows) => [...rows, blankService()])}>
          Add service
        </Button>
      </Stack>
      )}
      {current === "map" && (
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700 }}>Pin on the map</Typography>
        <Typography color="text.secondary">Tap the map to place the shop. It shows up with the other city places.</Typography>
        {point && (
          <PlaceMap
            center={point}
            zoom={15}
            height={320}
            onPick={(latitude, longitude) => {
              setPlaced(true);
              setPoint({ latitude, longitude });
            }}
            pins={[
              {
                id: "draft",
                name: name.trim() || "New shop",
                latitude: point.latitude,
                longitude: point.longitude,
                color: "#0b6e79",
                label: "Shop",
              },
            ]}
          />
        )}
        {point && <LiveWeather latitude={point.latitude} longitude={point.longitude} compact />}
      </Stack>
      )}
      {current === "review" && (
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 700 }}>{name.trim() || "New shop"}</Typography>
          <Typography color="text.secondary">
            {SHOP_CATEGORY[category] ?? category} · {wards.find((item) => item.id === ward)?.name ?? "Ward"} · {hours}
          </Typography>
          <Typography>{address}</Typography>
          {phone && <Typography>Phone {phone}</Typography>}
          <Typography>{about}</Typography>
          <Typography sx={{ fontWeight: 700 }}>Catalog</Typography>
          {listedItems.length === 0 && <Typography color="text.secondary">No catalog items.</Typography>}
          {listedItems.map((item) => (
            <Stack key={item.key} direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <ItemThumb src={item.media.find((draft) => draft.kind === "image")?.src} alt={item.name} size={40} />
              <Typography>
                {item.name} · ₹{item.price}
                {item.media.length ? ` · ${item.media.length} photos and videos` : ""}
              </Typography>
            </Stack>
          ))}
          {shopMedia.length > 0 && <Typography color="text.secondary">{shopMedia.length} shop photos and videos attached.</Typography>}
          <Typography sx={{ fontWeight: 700 }}>Services</Typography>
          {listedServices.length === 0 && <Typography color="text.secondary">No services.</Typography>}
          {listedServices.map((service) => (
            <Typography key={service.key}>
              {service.name}
              {service.price.trim() ? ` · ₹${service.price}` : ""}
              {service.duration.trim() ? ` · ${service.duration} min` : ""}
            </Typography>
          ))}
          <Typography color="text.secondary">
            {placed ? "Pin placed on the map." : "Pin starts at the ward centre. Go back to the map step to move it."}
          </Typography>
        </Stack>
      )}
      {formError && <Alert severity="error">{formError}</Alert>}
      <Stack direction="row" spacing={1}>
        {step > 0 && (
          <Button
            onClick={() => {
              setFormError(null);
              setStep((current) => current - 1);
            }}
          >
            Back
          </Button>
        )}
        {current !== "review" ? (
          <Button variant="contained" disabled={uploading} onClick={continueStep}>
            {uploading ? "Uploading…" : "Continue"}
          </Button>
        ) : (
          <Button variant="contained" disabled={busy || uploading || !point} onClick={() => void submit()}>
            {uploading ? "Uploading…" : busy ? "Saving…" : request ? "Send for approval" : "Create shop and QR"}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

function toPaise(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || value.trim() === "") return null;
  return Math.round(amount * 100);
}

function toService(draft: DraftService) {
  const name = draft.name.trim();
  if (!name) return "Give every service a name.";
  const price = draft.price.trim() === "" ? null : toPaise(draft.price);
  if (price === null && draft.price.trim() !== "") return `Use a price in rupees for ${name}, or leave it blank.`;
  const duration = draft.duration.trim() === "" ? null : Number(draft.duration);
  if (duration !== null && (!Number.isInteger(duration) || duration < 5 || duration > 1440)) {
    return `Use whole minutes between 5 and 1440 for ${name}, or leave it blank.`;
  }
  return {
    name,
    description: draft.description.trim(),
    price_paise: price,
    duration_minutes: duration,
    is_available: draft.available,
  };
}
