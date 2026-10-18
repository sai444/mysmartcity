import { Alert, Box, Button, Chip, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import { errorMessage } from "../../api/client";
import { surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { rupees } from "../city/labels";
import { PageIntro, when } from "../life/ui";
import { ItemThumb } from "../shop/ItemPhoto";
import {
  actOnOrder,
  assetUrl,
  myListings,
  myOrders,
  ORDER_STATUS,
  updateListing,
  type ListingSummary,
  type MarketOrder,
  type OrderAction,
} from "./api";
import { Loading, MarketTabs, RatingLine, StatusChip } from "./parts";

type View = "selling" | "buying";
type Data = { listings: ListingSummary[]; buying: MarketOrder[]; selling: MarketOrder[] };

const isOpen = (order: MarketOrder) => order.status === "placed" || order.status === "accepted";

export default function MyMarketPage() {
  const { user, ready } = useAuth();
  const signIn = useLoginPath();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "buying" ? "buying" : "selling";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [listings, orders] = await Promise.all([myListings(), myOrders()]);
      setData({ listings, ...orders });
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, []);

  useEffect(() => {
    if (ready && user) void load();
  }, [ready, user?.id, load]);

  const header = (
    <>
      <PageIntro kicker="NEIGHBOURHOOD MARKET" title="Market" lede="Orders you need to handle, things you are selling, and things you have asked to buy." />
      <MarketTabs />
    </>
  );

  if (ready && !user) {
    return (
      <Stack spacing={2.5}>
        {header}
        <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Typography>Sign in to see your listings and orders.</Typography>
          <Button variant="contained" component={RouterLink} to={signIn}>
            Sign in
          </Button>
        </Stack>
      </Stack>
    );
  }

  const toHandle = data?.selling.filter(isOpen).length ?? 0;
  const waiting = data?.buying.filter(isOpen).length ?? 0;

  return (
    <Stack spacing={2.5}>
      {header}
      <ToggleButtonGroup
        exclusive
        value={view}
        onChange={(_event, next: View | null) => next && setParams(next === "buying" ? { view: "buying" } : {}, { replace: true })}
        size="small"
      >
        <ToggleButton value="selling">Selling{toHandle ? ` · ${toHandle} to handle` : ""}</ToggleButton>
        <ToggleButton value="buying">Buying{waiting ? ` · ${waiting} open` : ""}</ToggleButton>
      </ToggleButtonGroup>
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Loading label="Loading your market" />}
      {data && view === "selling" && <Selling data={data} onChanged={load} />}
      {data && view === "buying" && <Buying orders={data.buying} onChanged={load} />}
    </Stack>
  );
}

function Selling({ data, onChanged }: { data: Data; onChanged: () => Promise<void> }) {
  const open = data.selling.filter(isOpen);
  const past = data.selling.filter((order) => !isOpen(order));
  return (
    <Stack spacing={3}>
      <Stack spacing={1.25}>
        <Typography variant="h2">Orders to handle</Typography>
        {open.length === 0 && <Typography color="text.secondary">No open orders right now.</Typography>}
        {open.map((order) => (
          <OrderCard key={order.id} order={order} role="seller" onChanged={onChanged} />
        ))}
      </Stack>

      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h2">Your listings</Typography>
          <Button component={RouterLink} to="/market/sell" variant="contained" size="small">
            Sell an item
          </Button>
        </Stack>
        {data.listings.length === 0 && <Typography color="text.secondary">You have not listed anything yet.</Typography>}
        {data.listings.map((listing) => (
          <ListingRow key={listing.id} listing={listing} onChanged={onChanged} />
        ))}
      </Stack>

      {past.length > 0 && (
        <Stack spacing={1.25}>
          <Typography variant="h2">Past sales</Typography>
          {past.map((order) => (
            <OrderCard key={order.id} order={order} role="seller" onChanged={onChanged} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function Buying({ orders, onChanged }: { orders: MarketOrder[]; onChanged: () => Promise<void> }) {
  if (!orders.length) {
    return (
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Typography color="text.secondary">You have not asked to buy anything yet.</Typography>
        <Button component={RouterLink} to="/market" variant="contained">
          Browse the market
        </Button>
      </Stack>
    );
  }
  return (
    <Stack spacing={1.25}>
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} role="buyer" onChanged={onChanged} />
      ))}
    </Stack>
  );
}

function ListingRow({ listing, onChanged }: { listing: ListingSummary; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await updateListing(listing.id, { status: listing.status === "paused" ? "active" : "paused" });
      await onChanged();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={[surfaceSx, { display: "flex", gap: 1.5, alignItems: "flex-start" }]}>
      <ItemThumb src={assetUrl(listing.cover_url)} alt={listing.title} size={72} />
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{listing.title}</Typography>
          <StatusChip status={listing.status} />
          {listing.open_orders > 0 && <Chip size="small" color="info" label={`${listing.open_orders} open`} />}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {rupees(listing.price_paise)} · {listing.quantity} left
        </Typography>
        <RatingLine value={listing.rating_avg} count={listing.review_count} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Button size="small" component={RouterLink} to={`/market/${listing.id}`}>
            View
          </Button>
          <Button size="small" component={RouterLink} to={`/market/${listing.id}/edit`}>
            Edit
          </Button>
          <Button size="small" disabled={busy} onClick={() => void toggle()}>
            {listing.status === "paused" ? "Resume" : "Pause"}
          </Button>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Box>
  );
}

function OrderCard({ order, role, onChanged }: { order: MarketOrder; role: "buyer" | "seller"; onChanged: () => Promise<void> }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = ORDER_STATUS[order.status];

  async function act(action: OrderAction) {
    setBusy(true);
    setError(null);
    try {
      await actOnOrder(order.id, action, reply);
      setReply("");
      await onChanged();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const other = role === "seller" ? `Buyer: ${order.buyer_name}` : `Seller: ${order.seller_name}`;
  return (
    <Box sx={[surfaceSx, { display: "flex", gap: 1.5, alignItems: "flex-start" }]}>
      <ItemThumb src={assetUrl(order.cover_url)} alt={order.title} size={64} />
      <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
          <Typography
            component={RouterLink}
            to={`/market/${order.listing_id}`}
            sx={{ fontWeight: 700, color: "inherit", overflowWrap: "anywhere" }}
          >
            {order.title}
          </Typography>
          <Chip size="small" label={status.label} color={status.color} sx={{ alignSelf: { xs: "flex-start", sm: "center" } }} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {order.quantity > 1 ? `${order.quantity} × ${rupees(order.price_paise)} = ` : ""}
          {rupees(order.total_paise)} · {other} · {when(order.created_at)}
        </Typography>
        {order.note && (
          <Typography variant="body2">
            <strong>{role === "seller" ? `${order.buyer_name}:` : "You:"}</strong> {order.note}
          </Typography>
        )}
        {order.seller_note && (
          <Typography variant="body2">
            <strong>{role === "seller" ? "You:" : `${order.seller_name}:`}</strong> {order.seller_note}
          </Typography>
        )}

        {role === "seller" && isOpen(order) && (
          <Stack spacing={1}>
            <TextField
              size="small"
              label={order.status === "placed" ? "Reply to the buyer (pickup time, place)" : "Add a note for the buyer"}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 300 } }}
            />
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {order.status === "placed" && (
                <Button size="small" variant="contained" disabled={busy} onClick={() => void act("accept")}>
                  Accept
                </Button>
              )}
              <Button size="small" variant={order.status === "accepted" ? "contained" : "outlined"} disabled={busy} onClick={() => void act("complete")}>
                Mark handed over
              </Button>
              <Button size="small" color="error" disabled={busy} onClick={() => void act("decline")}>
                Decline
              </Button>
            </Stack>
          </Stack>
        )}

        {role === "buyer" && isOpen(order) && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button size="small" variant="contained" disabled={busy} onClick={() => void act("complete")}>
              I received it
            </Button>
            <Button size="small" color="error" disabled={busy} onClick={() => void act("cancel")}>
              Cancel order
            </Button>
          </Stack>
        )}

        {role === "buyer" && order.status === "completed" && (
          <Button size="small" variant={order.reviewed ? "text" : "contained"} component={RouterLink} to={`/market/${order.listing_id}#reviews`} sx={{ alignSelf: "flex-start" }}>
            {order.reviewed ? "Edit your review" : "Write a review"}
          </Button>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Box>
  );
}
