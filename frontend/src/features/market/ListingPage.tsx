import { Alert, Box, Button, Divider, Rating, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, useLocation, useParams } from "react-router-dom";

import { errorMessage } from "../../api/client";
import { surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { rupees } from "../city/labels";
import { logMarketOrder } from "../life/store";
import { when } from "../life/ui";
import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  deleteReview,
  getListing,
  placeOrder,
  updateListing,
  writeReview,
  type ListingDetail,
} from "./api";
import { galleryOf, MediaGallery } from "../media/MediaGallery";
import { BackLink, Cover, Loading, RatingLine, StatusChip } from "./parts";

export default function ListingPage() {
  const { listingId = "" } = useParams();
  const { hash } = useLocation();
  const { user, ready } = useAuth();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return getListing(listingId)
      .then(setListing)
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [listingId]);

  useEffect(() => {
    if (!ready) return;
    setListing(null);
    setError(null);
    void load();
  }, [ready, user?.id, load]);

  const loaded = Boolean(listing);
  useEffect(() => {
    if (loaded && hash === "#reviews") document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" });
  }, [loaded, hash]);

  if (error && !listing) {
    return (
      <Stack spacing={2}>
        <BackLink to="/market" label="Back to market" />
        <Alert severity="error">{error}</Alert>
      </Stack>
    );
  }
  if (!listing) return <Loading label="Loading listing" />;

  return (
    <Stack spacing={2.5}>
      <BackLink to="/market" label="Back to market" />
      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.3fr) minmax(280px, 1fr)" }, alignItems: "start" }}>
        {listing.photos.length || listing.media.length ? (
          <MediaGallery
            title={listing.title}
            items={[...listing.photos.map((photo) => ({ key: photo.id, kind: "image" as const, url: photo.url })), ...galleryOf(listing.media)]}
          />
        ) : (
          <Cover src={null} alt={listing.title} height={280} />
        )}
        <Stack spacing={2}>
          <Stack spacing={0.75}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <StatusChip status={listing.status} />
              <Typography variant="body2" color="text.secondary">
                {CATEGORY_LABEL[listing.category]} · {CONDITION_LABEL[listing.condition]}
              </Typography>
            </Stack>
            <Typography variant="h1" sx={{ overflowWrap: "anywhere" }}>
              {listing.title}
            </Typography>
            <Typography variant="h2">{rupees(listing.price_paise)}</Typography>
            <RatingLine value={listing.rating_avg} count={listing.review_count} size="medium" />
            <Typography color="text.secondary">
              {listing.ward_name}
              {listing.pickup_area && ` · Pickup at ${listing.pickup_area}`}
            </Typography>
            {listing.quantity > 1 && listing.status === "active" && <Typography color="text.secondary">{listing.quantity} available</Typography>}
          </Stack>

          <BuyBox listing={listing} signedIn={Boolean(user)} ready={ready} onChanged={load} userId={user?.id ?? null} />

          <Box sx={surfaceSx}>
            <Typography sx={{ fontWeight: 700 }}>Sold by {listing.seller.name}</Typography>
            <RatingLine value={listing.seller.rating_avg} count={listing.seller.review_count} />
            <Typography variant="body2" color="text.secondary">
              {listing.seller.active_listings} live {listing.seller.active_listings === 1 ? "listing" : "listings"} ·{" "}
              {listing.seller.completed_sales} completed {listing.seller.completed_sales === 1 ? "sale" : "sales"}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Stack spacing={1}>
        <Typography variant="h2">About this item</Typography>
        <Typography sx={{ whiteSpace: "pre-line" }}>{listing.description}</Typography>
        <Typography variant="body2" color="text.secondary">
          Listed {when(listing.created_at)}
          {listing.updated_at !== listing.created_at && ` · Updated ${when(listing.updated_at)}`}
        </Typography>
      </Stack>

      <Divider />
      <Reviews listing={listing} onChanged={setListing} />
    </Stack>
  );
}

function BuyBox({
  listing,
  signedIn,
  ready,
  userId,
  onChanged,
}: {
  listing: ListingDetail;
  signedIn: boolean;
  ready: boolean;
  userId: string | null;
  onChanged: () => Promise<unknown>;
}) {
  const signIn = useLoginPath();
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (listing.viewer.is_seller) {
    const toggle = async () => {
      setBusy(true);
      setMessage(null);
      try {
        await updateListing(listing.id, { status: listing.status === "paused" ? "active" : "paused" });
        await onChanged();
      } catch (reason) {
        setMessage({ tone: "error", text: errorMessage(reason) });
      } finally {
        setBusy(false);
      }
    };
    return (
      <Box sx={surfaceSx}>
        <Stack spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>This is your listing</Typography>
          {listing.open_orders > 0 && (
            <Alert severity="info">
              {listing.open_orders} open {listing.open_orders === 1 ? "order" : "orders"} waiting in My market.
            </Alert>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button variant="contained" component={RouterLink} to={`/market/${listing.id}/edit`}>
              Edit listing
            </Button>
            <Button variant="outlined" disabled={busy} onClick={() => void toggle()}>
              {listing.status === "paused" ? "Resume listing" : "Pause listing"}
            </Button>
            <Button component={RouterLink} to="/market/mine">
              Manage orders
            </Button>
          </Stack>
          {message && <Alert severity={message.tone}>{message.text}</Alert>}
        </Stack>
      </Box>
    );
  }

  if (ready && !signedIn) {
    return (
      <Button variant="contained" component={RouterLink} to={signIn} sx={{ alignSelf: "flex-start" }}>
        Sign in to buy
      </Button>
    );
  }

  if (listing.viewer.open_order_id) {
    return (
      <Alert
        severity="info"
        action={
          <Button color="inherit" size="small" component={RouterLink} to="/market/mine?view=buying">
            View order
          </Button>
        }
      >
        You have an open order for this item. {message?.tone === "success" ? message.text : ""}
      </Alert>
    );
  }

  if (listing.status !== "active") {
    return <Alert severity="warning">{listing.status === "sold_out" ? "This item is sold out." : "The seller has paused this listing."}</Alert>;
  }

  async function buy(event: FormEvent) {
    event.preventDefault();
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > listing.quantity) {
      setMessage({ tone: "error", text: `Choose between 1 and ${listing.quantity}.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const order = await placeOrder(listing.id, count, note);
      if (userId) logMarketOrder(userId, order);
      setMessage({ tone: "success", text: `${listing.seller.name} will confirm a pickup time.` });
      await onChanged();
    } catch (reason) {
      setMessage({ tone: "error", text: errorMessage(reason) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="form" onSubmit={buy} sx={surfaceSx}>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }}>Request to buy</Typography>
        <Typography variant="body2" color="text.secondary">
          The seller accepts your request, you meet at the pickup point, and you pay on handover. You can review the item once you have it.
        </Typography>
        {listing.quantity > 1 && (
          <TextField
            label="Quantity"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            slotProps={{ htmlInput: { min: 1, max: listing.quantity } }}
            sx={{ maxWidth: 160 }}
          />
        )}
        <TextField
          label="Message to the seller"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="When can you pick it up?"
          multiline
          minRows={2}
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
        <Button type="submit" variant="contained" disabled={busy || !ready} sx={{ alignSelf: "flex-start" }}>
          {busy ? "Sending…" : `Request to buy · ${rupees(listing.price_paise * (Number(quantity) || 1))}`}
        </Button>
        {message && <Alert severity={message.tone}>{message.text}</Alert>}
      </Stack>
    </Box>
  );
}

function Reviews({ listing, onChanged }: { listing: ListingDetail; onChanged: (listing: ListingDetail) => void }) {
  const mine = listing.viewer.my_review;
  const [rating, setRating] = useState<number | null>(mine?.rating ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [editing, setEditing] = useState(!mine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) {
      setError("Pick a star rating.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await writeReview(listing.id, rating, comment));
      setEditing(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteReview(listing.id);
      onChanged(await getListing(listing.id));
      setRating(null);
      setComment("");
      setEditing(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={1.5} id="reviews" sx={{ scrollMarginTop: 80 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="h2">Reviews</Typography>
        <RatingLine value={listing.rating_avg} count={listing.review_count} />
      </Stack>

      {listing.viewer.can_review && (editing || !mine) && (
        <Box component="form" onSubmit={submit} sx={surfaceSx}>
          <Stack spacing={1.25}>
            <Typography sx={{ fontWeight: 700 }}>{mine ? "Edit your review" : "How was it?"}</Typography>
            <Rating value={rating} onChange={(_event, value) => setRating(value)} size="large" aria-label="Your rating" />
            <TextField
              label="Your review"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Was it as described? How was the pickup?"
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 600 } }}
            />
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" disabled={busy}>
                {mine ? "Save review" : "Post review"}
              </Button>
              {mine && (
                <Button disabled={busy} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </Box>
      )}
      {!listing.viewer.can_review && !listing.viewer.is_seller && (
        <Typography variant="body2" color="text.secondary">
          Reviews come from neighbours who bought and received this item.
        </Typography>
      )}

      {listing.reviews.map((review) => {
        const own = review.id === mine?.id;
        return (
          <Box key={review.id} sx={surfaceSx}>
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Rating value={review.rating} readOnly size="small" />
                <Typography sx={{ fontWeight: 700 }}>{own ? "You" : review.reviewer_name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {when(review.updated_at)}
                </Typography>
              </Stack>
              {review.comment && <Typography sx={{ whiteSpace: "pre-line" }}>{review.comment}</Typography>}
              {own && !editing && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" disabled={busy} onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                  <Button size="small" color="error" disabled={busy} onClick={() => void remove()}>
                    Delete
                  </Button>
                </Stack>
              )}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
