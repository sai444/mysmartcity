import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { errorMessage } from "../../api/client";
import type { CommerceOrder } from "../../api/types";
import { useAuth } from "../auth/AuthContext";
import { rupees } from "../city/labels";
import { CHANNELS } from "../commerce/catalog";
import { FlowSteps } from "../commerce/parts";
import { reorder, useLife, type CartLine, type Channel, type Order } from "../life/store";
import { PageIntro, Surface, when } from "../life/ui";
import { actOnCommerceOrder, cancelCommerceOrder, getCommerceOrder } from "./api";
import { actionLabel, isOpenOrder, ORDER_ACTION, ORDER_FLOW, orderLabel } from "./labels";

const POLL_MS = 15_000;

export default function OrderPage() {
  const { orderId } = useParams();
  const { user, ready } = useAuth();
  const life = useLife(user?.id ?? null);
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    if (!orderId || !user) return;
    getCommerceOrder(orderId)
      .then((payload) => {
        setOrder(payload);
        setError(null);
        setMissing(false);
      })
      .catch((reason: unknown) => {
        const message = errorMessage(reason);
        if (message.toLowerCase().includes("not found")) {
          setMissing(true);
          setOrder(null);
        } else {
          setError(message);
        }
      });
  }, [orderId, user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!order || !isOpenOrder(order)) return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [order, load]);

  if (!ready) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Loading order" />
      </Box>
    );
  }
  if (!user) {
    return (
      <Surface>
        <Typography sx={{ fontWeight: 700 }}>Sign in to see this order</Typography>
        <Button
          component={RouterLink}
          to={`/login?next=${encodeURIComponent(`/orders/${orderId ?? ""}`)}`}
          variant="contained"
          sx={{ mt: 1.5 }}
        >
          Sign in
        </Button>
      </Surface>
    );
  }
  if (error) {
    return (
      <Surface>
        <Alert severity="error">{error}</Alert>
        <Button onClick={load} sx={{ mt: 1.5 }}>
          Retry
        </Button>
      </Surface>
    );
  }
  if (order) return <OrderDetail order={order} onChanged={setOrder} />;

  const local = life.orders.find((item) => item.id === orderId);
  if (local) return <LegacyOrderDetail order={local} userId={user.id} />;

  if (!missing && orderId) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Loading order" />
      </Box>
    );
  }

  return (
    <Surface>
      <Typography sx={{ fontWeight: 700 }}>Order not found</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
        It may belong to another account. Your orders are listed on Activity.
      </Typography>
      <Button component={RouterLink} to="/activity" variant="contained">
        Open activity
      </Button>
    </Surface>
  );
}

function OrderDetail({ order, onChanged }: { order: CommerceOrder; onChanged: (order: CommerceOrder) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = order.status === "delivered" || order.status === "cancelled";
  const home = CHANNELS[order.channel].base;
  const reached = new Set(order.events.map((event) => event.status));
  const timeline = order.status === "cancelled" ? [...ORDER_FLOW.filter((status) => reached.has(status)), "cancelled" as const] : ORDER_FLOW;

  async function runAction(action: (typeof order.next_actions)[number]) {
    let note: string | undefined;
    if (action === "cancel") {
      const answer = window.prompt("Cancel this order? Add a note the resident will see (optional).", "");
      if (answer === null) return;
      note = answer;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await actOnCommerceOrder(order.id, action, note));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await cancelCommerceOrder(order.id));
      setConfirming(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function onReorder() {
    if (!user) return;
    reorder(user.id, toLocalOrder(order));
    navigate(`${home}/cart`);
  }

  return (
    <Stack spacing={2.5}>
      <FlowSteps active={finished ? 4 : 3} />
      <PageIntro
        kicker={order.channel === "grocery" ? "Grocery order" : "Food order"}
        title={orderLabel(order.status, order.channel)}
        lede={`${order.shop_name} · placed ${when(order.placed_at)}`}
      />
      {order.status === "cancelled" && (
        <Alert severity="info">
          {order.payment === "upi"
            ? `This order was cancelled. ${rupees(order.total_paise)} goes back to your UPI account.`
            : "This order was cancelled."}
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 340px" } }}>
        <Surface>
          <Stack spacing={1.5}>
            <Typography variant="h2">Status</Typography>
            <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }} aria-label="Order status">
              {timeline.map((status) => {
                const event = order.events.find((item) => item.status === status);
                const current = status === order.status;
                return (
                  <Stack
                    component="li"
                    key={status}
                    direction="row"
                    spacing={1.5}
                    sx={{ py: 0.75, alignItems: "center", color: event ? "text.primary" : "text.secondary" }}
                    aria-current={current ? "step" : undefined}
                  >
                    {event ? (
                      <CheckCircleIcon color={status === "cancelled" ? "disabled" : "primary"} aria-hidden />
                    ) : (
                      <RadioButtonUncheckedIcon color="disabled" aria-hidden />
                    )}
                    <Stack>
                      <Typography sx={{ fontWeight: current ? 700 : 400 }}>{orderLabel(status, order.channel)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {event ? `${when(event.created_at)}${event.note ? ` · ${event.note}` : ""}` : "Waiting for the shop"}
                      </Typography>
                    </Stack>
                  </Stack>
                );
              })}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Deliver to {order.address}
              {order.note ? ` · Note: ${order.note}` : ""}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {order.next_actions.map((action) => (
                <Button
                  key={action}
                  variant={action === "accept" || action === "deliver" ? "contained" : "outlined"}
                  color={ORDER_ACTION[action].color ?? "primary"}
                  disabled={busy}
                  onClick={() => void runAction(action)}
                >
                  {actionLabel(action, order.channel)}
                </Button>
              ))}
              {order.can_cancel && !order.next_actions.includes("cancel") && (
                <Button variant="outlined" color="error" onClick={() => setConfirming(true)}>
                  Cancel order
                </Button>
              )}
              {finished && (
                <Button variant="contained" onClick={onReorder}>
                  Order again
                </Button>
              )}
              <Button component={RouterLink} to={home}>
                Continue shopping
              </Button>
              <Button component={RouterLink} to="/activity">
                All activity
              </Button>
            </Stack>
          </Stack>
        </Surface>
        <Receipt
          lines={order.lines.map((line) => ({ name: line.name, qty: line.qty, pricePaise: line.unit_price_paise }))}
          subtotal={order.subtotal_paise}
          fee={order.fee_paise}
          total={order.total_paise}
          payment={order.payment}
        />
      </Box>
      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Cancel this order?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {order.channel === "food" ? "The kitchen has not started cooking yet." : "The shop has not started packing yet."} This
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Keep order</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void onCancel()}>
            Cancel order
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function LegacyOrderDetail({ order, userId }: { order: Order; userId: string }) {
  const navigate = useNavigate();
  const home = CHANNELS[order.channel].base;

  return (
    <Stack spacing={2.5}>
      <FlowSteps active={4} />
      <PageIntro
        kicker={order.channel === "grocery" ? "Grocery order" : "Food order"}
        title={order.cancelledAt ? "Cancelled" : "Earlier order"}
        lede={`${[...new Set(order.lines.map((line) => line.shopName))].join(", ")} · placed ${when(order.placedAt)}`}
      />
      <Alert severity="info">This order was placed before live tracking. New orders stay on the shop desk until they are delivered.</Alert>
      <Receipt
        lines={order.lines.map((line) => ({ name: line.name, qty: line.qty, pricePaise: line.pricePaise }))}
        subtotal={order.subtotalPaise}
        fee={order.feePaise}
        total={order.totalPaise}
        payment={order.payment}
      />
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          onClick={() => {
            reorder(userId, order);
            navigate(`${home}/cart`);
          }}
        >
          Order again
        </Button>
        <Button component={RouterLink} to="/activity">
          All activity
        </Button>
      </Stack>
    </Stack>
  );
}

function Receipt({
  lines,
  subtotal,
  fee,
  total,
  payment,
}: {
  lines: { name: string; qty: number; pricePaise: number }[];
  subtotal: number;
  fee: number;
  total: number;
  payment: "upi" | "cod";
}) {
  return (
    <Surface>
      <Stack spacing={1}>
        <Typography variant="h2">Receipt</Typography>
        {lines.map((line) => (
          <Stack key={`${line.name}-${line.qty}`} direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
            <Typography>
              {line.qty} × {line.name}
            </Typography>
            <Typography>{rupees(line.pricePaise * line.qty)}</Typography>
          </Stack>
        ))}
        <Stack direction="row" sx={{ justifyContent: "space-between", pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography color="text.secondary">Items</Typography>
          <Typography color="text.secondary">{rupees(subtotal)}</Typography>
        </Stack>
        {fee > 0 && (
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography color="text.secondary">Delivery</Typography>
            <Typography color="text.secondary">{rupees(fee)}</Typography>
          </Stack>
        )}
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 700 }}>Total</Typography>
          <Typography sx={{ fontWeight: 700 }}>{rupees(total)}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {payment === "upi" ? "Paid with UPI" : `Pay ${rupees(total)} in cash on delivery`}
        </Typography>
      </Stack>
    </Surface>
  );
}

function toLocalOrder(order: CommerceOrder): Order {
  const lines: CartLine[] = order.lines.map((line) => ({
    itemId: line.item_id,
    shopSlug: order.shop_slug,
    shopName: order.shop_name,
    name: line.name,
    pricePaise: line.unit_price_paise,
    qty: line.qty,
    channel: order.channel as Channel,
  }));
  return {
    id: order.id,
    channel: order.channel,
    lines,
    address: order.address,
    note: order.note,
    payment: order.payment,
    subtotalPaise: order.subtotal_paise,
    feePaise: order.fee_paise,
    totalPaise: order.total_paise,
    placedAt: order.placed_at,
  };
}
