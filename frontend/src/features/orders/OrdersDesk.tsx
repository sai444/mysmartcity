import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { errorMessage } from "../../api/client";
import type { CommerceAction, CommerceChannel, CommerceOrder, CommerceOrderStatus } from "../../api/types";
import { insetSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { rupees } from "../city/labels";
import { when } from "../life/ui";
import { actOnCommerceOrder } from "./api";
import { actionLabel, isOpenOrder, ORDER_ACTION, ORDER_STATUS, orderLabel, orderSummary } from "./labels";

type Filter = CommerceOrderStatus | "open" | "all";

export function OrdersDesk({
  orders,
  loading,
  error,
  empty,
  onReload,
  admin = false,
}: {
  orders: CommerceOrder[] | null;
  loading?: boolean;
  error?: string | null;
  empty: string;
  onReload: () => void;
  admin?: boolean;
}) {
  const [status, setStatus] = useState<Filter>("open");
  const [channel, setChannel] = useState<CommerceChannel | "all">("all");
  const rows = useMemo(() => {
    return (orders ?? []).filter((order) => {
      const statusOk = status === "all" ? true : status === "open" ? isOpenOrder(order) : order.status === status;
      const channelOk = channel === "all" || order.channel === channel;
      return statusOk && channelOk;
    });
  }, [orders, status, channel]);

  if (loading || orders === null) {
    return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading orders" />;
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField select label="Show" value={status} onChange={(event) => setStatus(event.target.value as Filter)} size="small" sx={{ minWidth: 200 }}>
          <MenuItem value="open">Open orders</MenuItem>
          <MenuItem value="all">All orders</MenuItem>
          {(Object.keys(ORDER_STATUS) as CommerceOrderStatus[]).map((key) => (
            <MenuItem key={key} value={key}>
              {ORDER_STATUS[key].label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Channel"
          value={channel}
          onChange={(event) => setChannel(event.target.value as CommerceChannel | "all")}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">Grocery and food</MenuItem>
          <MenuItem value="grocery">Grocery</MenuItem>
          <MenuItem value="food">Food</MenuItem>
        </TextField>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {rows.length === 0 && (
        <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
          <Typography color="text.secondary">{empty}</Typography>
        </Box>
      )}
      {rows.map((order) => (
        <OrderDeskCard key={order.id} order={order} admin={admin} onChanged={onReload} />
      ))}
    </Stack>
  );
}

const POLL_MS = 15_000;

export function useIncomingOrders(load: () => Promise<CommerceOrder[]>) {
  const [orders, setOrders] = useState<CommerceOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    load()
      .then((rows) => {
        setOrders(rows);
        setError(null);
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [load]);

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  return { orders, error, reload };
}

function OrderDeskCard({ order, admin, onChanged }: { order: CommerceOrder; admin: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chip = ORDER_STATUS[order.status];

  async function run(action: CommerceAction) {
    let note: string | undefined;
    if (action === "cancel") {
      const answer = window.prompt("Cancel this order? Add a note the resident will see (optional).", "");
      if (answer === null) return;
      note = answer;
    }
    setBusy(true);
    setError(null);
    try {
      await actOnCommerceOrder(order.id, action, note, admin);
      onChanged();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={surfaceSx}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {order.shop_name} · {order.buyer_name}
            </Typography>
            <Chip label={orderLabel(order.status, order.channel)} color={chip.color} size="small" variant="outlined" />
          </Stack>
          <Typography sx={{ mt: 0.5 }}>{orderSummary(order)}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Deliver to {order.address}
            {order.note ? ` · Note: ${order.note}` : ""} · {order.payment === "upi" ? "Paid with UPI" : "Cash on delivery"} ·{" "}
            {rupees(order.total_paise)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Placed {when(order.placed_at)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, flex: "0 0 auto" }}>
          {order.next_actions.map((action) => (
            <Button
              key={action}
              size="small"
              variant={action === "accept" || action === "deliver" ? "contained" : "outlined"}
              color={ORDER_ACTION[action].color ?? "primary"}
              disabled={busy}
              onClick={() => void run(action)}
            >
              {actionLabel(action, order.channel)}
            </Button>
          ))}
          <Button component={RouterLink} to={`/orders/${order.id}`} size="small">
            Track
          </Button>
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
