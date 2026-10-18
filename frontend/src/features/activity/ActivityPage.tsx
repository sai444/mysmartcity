import { Alert, Button, Chip, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { apiGet } from "../../api/client";
import type { CivicReport, CommerceOrder } from "../../api/types";
import { useAuth } from "../auth/AuthContext";
import { REPORT_STATUS, rupees } from "../city/labels";
import { useLife, type ActivityEntry, type ActivityKind } from "../life/store";
import { PageIntro, Surface, when } from "../life/ui";
import { useLoginPath } from "../auth/paths";
import { isOpenOrder, orderLabel, orderSummary } from "../orders/labels";
import { myCommerceOrders } from "../orders/api";

const FILTERS: { id: "all" | ActivityKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "report", label: "Reports" },
  { id: "bill", label: "Bills" },
  { id: "parking", label: "Parking" },
  { id: "grocery", label: "Grocery" },
  { id: "food", label: "Food" },
  { id: "travel", label: "Travel" },
  { id: "market", label: "Market" },
];

function fromOrder(order: CommerceOrder): ActivityEntry {
  return {
    id: order.id,
    kind: order.channel,
    title: `${order.channel === "grocery" ? "Grocery" : "Food"} · ${order.shop_name}`,
    detail: `${orderSummary(order)}. Deliver to ${order.address}.`,
    status: orderLabel(order.status, order.channel),
    amountPaise: order.total_paise,
    at: order.placed_at,
    orderId: order.id,
  };
}

function fromReport(report: CivicReport): ActivityEntry {
  return {
    id: report.id,
    kind: "report",
    title: `${report.category} · ${report.place}`,
    detail: report.admin_note ? `${report.details} City desk: ${report.admin_note}` : report.details,
    status: REPORT_STATUS[report.status]?.label ?? report.status,
    at: report.created_at,
  };
}

export default function ActivityPage() {
  const { user, ready } = useAuth();
  const life = useLife(user?.id ?? null);
  const signIn = useLoginPath();
  const location = useLocation();
  const placedCount = (location.state as { placed?: number } | null)?.placed;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [reports, setReports] = useState<CivicReport[]>([]);
  const [orders, setOrders] = useState<CommerceOrder[]>([]);

  useEffect(() => {
    if (!user) {
      setReports([]);
      setOrders([]);
      return;
    }
    let active = true;
    const loadReports = () =>
      apiGet<{ data: CivicReport[] }>("/api/v1/city/reports/mine")
        .then((payload) => {
          if (active) setReports(payload.data);
        })
        .catch(() => undefined);
    const loadOrders = () =>
      myCommerceOrders()
        .then((payload) => {
          if (active) setOrders(payload.data);
        })
        .catch(() => undefined);
    void loadReports();
    void loadOrders();
    const timer = window.setInterval(() => {
      void loadOrders();
      void loadReports();
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user]);

  const rows = useMemo(() => {
    const local = life.activity.filter((item) => item.kind !== "grocery" && item.kind !== "food");
    return [...reports.map(fromReport), ...orders.map(fromOrder), ...local]
      .filter((item) => filter === "all" || item.kind === filter)
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [reports, orders, life.activity, filter]);

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="History"
        title="Activity"
        lede="Your reports, bills, orders, bookings, and market purchases in one list, newest first."
      />
      {ready && !user && (
        <Surface>
          <Typography sx={{ fontWeight: 700 }}>Sign in to see your activity</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
            Everything you do in MyNagari is collected here.
          </Typography>
          <Button component={RouterLink} to={signIn} variant="contained">
            Sign in
          </Button>
        </Surface>
      )}
      {user && (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {FILTERS.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                clickable
                color={filter === item.id ? "primary" : "default"}
                variant={filter === item.id ? "filled" : "outlined"}
                onClick={() => setFilter(item.id)}
              />
            ))}
          </Stack>
          {placedCount ? (
            <Alert severity="success">
              {placedCount} {placedCount === 1 ? "order was" : "orders were"} placed. Track each one from this list.
            </Alert>
          ) : null}
          {rows.length === 0 && (
            <Surface>
              <Typography color="text.secondary">Nothing here yet. Try one of these:</Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1.5 }}>
                <Button component={RouterLink} to="/city/utilities" variant="outlined">
                  Pay a bill
                </Button>
                <Button component={RouterLink} to="/city/reports/new" variant="outlined">
                  Report an issue
                </Button>
                <Button component={RouterLink} to="/grocery" variant="outlined">
                  Order groceries
                </Button>
              </Stack>
            </Surface>
          )}
          <Stack spacing={1.25}>
            {rows.map((item) => (
              <Surface key={item.id}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.status}
                      {item.amountPaise ? ` · ${rupees(item.amountPaise)}` : ""}
                    </Typography>
                  </Stack>
                  <Typography>{item.detail}</Typography>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      {when(item.at)}
                    </Typography>
                    {item.orderId && (
                      <Button component={RouterLink} to={`/orders/${item.orderId}`} size="small">
                        {orders.find((order) => order.id === item.orderId && isOpenOrder(order)) ? "Track order" : "View order"}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Surface>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}
