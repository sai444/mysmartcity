import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { errorMessage, fieldErrors } from "../../api/client";
import { surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { PageIntro } from "../life/ui";
import { draftsFrom, hasCoverImage, mediaIds, type MediaDraft } from "../media/api";
import { MediaManager } from "../media/MediaManager";
import {
  assetUrl,
  CATEGORY_LABEL,
  CONDITION_LABEL,
  createListing,
  getListing,
  removeListing,
  updateListing,
  type ListingDetail,
  type MarketCategory,
  type MarketCondition,
} from "./api";
import { BackLink, Loading, MarketTabs, StatusChip } from "./parts";

const MAX_MEDIA = 8;
const OLD_PHOTO = "photo:";

type Draft = {
  title: string;
  description: string;
  category: MarketCategory;
  condition: MarketCondition;
  price: string;
  quantity: string;
  pickupArea: string;
  photos: MediaDraft[];
};

const BLANK: Draft = {
  title: "",
  description: "",
  category: "other",
  condition: "good",
  price: "",
  quantity: "1",
  pickupArea: "",
  photos: [],
};

function fromListing(listing: ListingDetail): Draft {
  return {
    title: listing.title,
    description: listing.description,
    category: listing.category,
    condition: listing.condition,
    price: String(listing.price_paise / 100),
    quantity: String(listing.quantity),
    pickupArea: listing.pickup_area,
    photos: [
      ...listing.photos.map((photo) => ({ key: `${OLD_PHOTO}${photo.id}`, kind: "image" as const, src: assetUrl(photo.url) ?? "" })),
      ...draftsFrom(listing.media),
    ],
  };
}

export default function SellPage() {
  const { listingId } = useParams();
  const editing = Boolean(listingId);
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const signIn = useLoginPath();
  const userId = user?.id;
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!listingId || !ready || !userId) return;
    let active = true;
    getListing(listingId)
      .then((found) => {
        if (!active) return;
        if (!found.viewer.is_seller) {
          setLoadError("Only the seller can edit this listing.");
          return;
        }
        setListing(found);
        setDraft(fromListing(found));
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [listingId, ready, userId]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    const found: Record<string, string> = {};
    const rupee = Number(draft.price);
    const quantity = Number(draft.quantity);
    if (draft.title.trim().length < 3) found.title = "Give it a title of at least 3 characters.";
    if (!draft.description.trim()) found.description = "Describe the item for buyers.";
    if (!Number.isFinite(rupee) || rupee < 1) found.price_paise = "Enter a price of at least ₹1.";
    if (!Number.isInteger(quantity) || quantity < (editing ? 0 : 1) || quantity > 999) found.quantity = "Enter a whole number up to 999.";
    if (!hasCoverImage(draft.photos)) found.photos = "Add at least one photo of the item.";
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length) return;
    const body = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      condition: draft.condition,
      price_paise: Math.round(Number(draft.price) * 100),
      quantity: Number(draft.quantity),
      pickup_area: draft.pickupArea.trim(),
      photos: draft.photos.flatMap((photo) => (photo.key.startsWith(OLD_PHOTO) ? [photo.key.slice(OLD_PHOTO.length)] : [])),
      media: mediaIds(draft.photos),
    };
    setBusy(true);
    try {
      const saved = listingId ? await updateListing(listingId, body) : await createListing(body);
      navigate(`/market/${saved.id}`);
    } catch (reason) {
      setErrors(fieldErrors(reason));
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!listingId) return;
    setBusy(true);
    setMessage(null);
    try {
      await removeListing(listingId);
      navigate("/market/mine");
    } catch (reason) {
      setMessage(errorMessage(reason));
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  }

  const intro = (
    <>
      {editing ? (
        <BackLink to={`/market/${listingId}`} label="Back to listing" />
      ) : (
        <PageIntro kicker="NEIGHBOURHOOD MARKET" title="Market" lede="List something for neighbours. Buyers send a request and you agree on a pickup." />
      )}
      {!editing && <MarketTabs />}
    </>
  );

  if (ready && !user) {
    return (
      <Stack spacing={2.5}>
        {intro}
        <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Typography>Sign in to sell on the market.</Typography>
          <Button variant="contained" component={RouterLink} to={signIn}>
            Sign in
          </Button>
        </Stack>
      </Stack>
    );
  }
  if (loadError) {
    return (
      <Stack spacing={2.5}>
        {intro}
        <Alert severity="error">{loadError}</Alert>
      </Stack>
    );
  }
  if (!ready || (editing && !listing)) return <Loading label="Loading listing" />;

  return (
    <Stack spacing={2.5}>
      {intro}
      <Box component="form" onSubmit={submit} noValidate sx={surfaceSx}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h2">{editing ? "Edit listing" : "Sell an item"}</Typography>
            {listing && <StatusChip status={listing.status} />}
          </Stack>

          <MediaManager
            value={draft.photos}
            onChange={(photos) => set("photos", photos)}
            onError={setMessage}
            onBusyChange={setUploading}
            max={MAX_MEDIA}
            hint={errors.photos ?? `Required. Up to ${MAX_MEDIA}. Add a short video to show it working. The first photo is the cover buyers see in the list.`}
            required
            disabled={busy}
          />

          <TextField
            label="Title"
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            error={Boolean(errors.title)}
            helperText={errors.title}
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label="Description"
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
            error={Boolean(errors.description)}
            helperText={errors.description ?? "Size, age, any marks or faults, and what is included."}
            required
            fullWidth
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              label="Category"
              value={draft.category}
              onChange={(event) => set("category", event.target.value as MarketCategory)}
              fullWidth
            >
              {(Object.keys(CATEGORY_LABEL) as MarketCategory[]).map((key) => (
                <MenuItem key={key} value={key}>
                  {CATEGORY_LABEL[key]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Condition"
              value={draft.condition}
              onChange={(event) => set("condition", event.target.value as MarketCondition)}
              fullWidth
            >
              {(Object.keys(CONDITION_LABEL) as MarketCondition[]).map((key) => (
                <MenuItem key={key} value={key}>
                  {CONDITION_LABEL[key]}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Price in rupees"
              value={draft.price}
              onChange={(event) => set("price", event.target.value)}
              error={Boolean(errors.price_paise)}
              helperText={errors.price_paise}
              required
              fullWidth
              inputMode="decimal"
            />
            <TextField
              label="Quantity available"
              type="number"
              value={draft.quantity}
              onChange={(event) => set("quantity", event.target.value)}
              error={Boolean(errors.quantity)}
              helperText={errors.quantity ?? (editing ? "Set to 0 to mark it sold out." : "More than 1 for things like homemade food.")}
              fullWidth
              slotProps={{ htmlInput: { min: editing ? 0 : 1, max: 999 } }}
            />
          </Stack>
          <TextField
            label="Pickup point"
            value={draft.pickupArea}
            onChange={(event) => set("pickupArea", event.target.value)}
            helperText="A landmark, not your full address. You can share details when you accept an order."
            fullWidth
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />

          {message && <Alert severity="error">{message}</Alert>}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button type="submit" variant="contained" disabled={busy || uploading}>
              {uploading ? "Uploading…" : busy ? "Saving…" : editing ? "Save changes" : "Publish listing"}
            </Button>
            {editing && !confirmRemove && (
              <Button color="error" disabled={busy} onClick={() => setConfirmRemove(true)}>
                Remove listing
              </Button>
            )}
          </Stack>
          {confirmRemove && (
            <Alert
              severity="warning"
              action={
                <Stack direction="row" spacing={1}>
                  <Button color="inherit" size="small" onClick={() => setConfirmRemove(false)}>
                    Keep
                  </Button>
                  <Button color="error" size="small" variant="contained" disabled={busy} onClick={() => void remove()}>
                    Remove
                  </Button>
                </Stack>
              }
            >
              Remove this listing for good? Past orders and reviews stay in your history.
            </Alert>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
