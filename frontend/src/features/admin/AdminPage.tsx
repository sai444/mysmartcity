import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import { apiGet, apiRequest, errorMessage } from "../../api/client";
import type {
  AdminOverview,
  AdminUserRow,
  AuditEntry,
  BusinessProfile,
  CivicReport,
  Feature,
  Notice,
  ReportStatus,
  ShopStatus,
} from "../../api/types";
import { insetSurfaceSx, kickerSx, surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { minutes, REPORT_STATUS, rupees, servicePrice, SHOP_CATEGORY } from "../city/labels";
import { useWard } from "../city/WardContext";
import { galleryOf, MediaDialogButton } from "../media/MediaGallery";
import { adminCommerceOrders } from "../orders/api";
import { OrdersDesk, useIncomingOrders } from "../orders/OrdersDesk";
import { BrokersTab, PropertiesTab } from "../property/PropertyAdmin";
import { ServicesTab, ServiceTypesTab } from "../services/ServicesAdmin";
import { FareDesk } from "../travel/TravelFares";
import { CityControlsTab } from "./CityControlsTab";
import { WardsTab } from "./WardsTab";
import { useFeatures } from "./FeatureContext";
import { STATUS_CHIP } from "./status";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "city", label: "City home" },
  { id: "wards", label: "Wards" },
  { id: "approvals", label: "Approvals" },
  { id: "shops", label: "Shops" },
  { id: "orders", label: "Orders" },
  { id: "properties", label: "Properties" },
  { id: "services", label: "Services" },
  { id: "service-types", label: "Service types" },
  { id: "brokers", label: "Brokers" },
  { id: "reports", label: "Reports" },
  { id: "notices", label: "Notices" },
  { id: "travel", label: "Travel fares" },
  { id: "features", label: "Features" },
  { id: "users", label: "Users" },
  { id: "activity", label: "Activity log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const { user, ready } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: TabId = TABS.some((item) => item.id === requested) ? (requested as TabId) : "overview";
  const [shops, setShops] = useState<BusinessProfile[] | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);

  const loadShops = useCallback(() => {
    apiGet<{ data: BusinessProfile[] }>("/api/v1/businesses/mine")
      .then((payload) => {
        setShops(payload.data);
        setShopError(null);
      })
      .catch((reason: unknown) => setShopError(errorMessage(reason)));
  }, []);

  const admin = user?.role === "admin";
  useEffect(() => {
    if (admin) loadShops();
  }, [admin, loadShops]);

  if (!ready) return <CircularProgress aria-label="Loading account" />;

  if (!admin) {
    return (
      <Box sx={[surfaceSx, { p: { xs: 3, sm: 4 }, maxWidth: 520 }]}>
        <Typography variant="h1">Admin console</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          Only city admins can open this page. Sign in with an admin account to manage shops, users, and features.
        </Typography>
        <Button component={RouterLink} to="/admin/login" variant="contained">
          Admin sign in
        </Button>
      </Box>
    );
  }

  const pending = shops?.filter((shop) => shop.status === "pending") ?? [];
  const replaceShop = (next: BusinessProfile) =>
    setShops((rows) => rows?.map((row) => (row.id === next.id ? { ...next, owned: true } : row)) ?? null);
  const dropShop = (id: string) => setShops((rows) => rows?.filter((row) => row.id !== id) ?? null);

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography sx={kickerSx}>City desk</Typography>
        <Typography variant="h1">Admin console</Typography>
        <Typography color="text.secondary">
          Approve shops, review property listings and brokers, move grocery and food orders through delivery, and manage who can sign in.
        </Typography>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={(_event, next: TabId) => setParams(next === "overview" ? {} : { tab: next })}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Admin sections"
        >
          {TABS.map((item) => (
            <Tab
              key={item.id}
              value={item.id}
              label={
                item.id === "approvals" && pending.length > 0 ? (
                  <Badge color="warning" badgeContent={pending.length} sx={{ "& .MuiBadge-badge": { right: -12 } }}>
                    {item.label}
                  </Badge>
                ) : (
                  item.label
                )
              }
              sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }}
            />
          ))}
        </Tabs>
      </Box>

      {shopError && <Alert severity="error">{shopError}</Alert>}

      {tab === "overview" && <OverviewTab pendingCount={pending.length} onOpen={(next) => setParams({ tab: next })} />}
      {tab === "city" && <CityControlsTab />}
      {tab === "wards" && <WardsTab />}
      {tab === "approvals" && (
        <ShopList
          shops={shops}
          filter="pending"
          empty="No shops are waiting. New requests from residents show up here."
          onChange={replaceShop}
          onRemoved={dropShop}
        />
      )}
      {tab === "shops" && <ShopsTab shops={shops} onChange={replaceShop} onRemoved={dropShop} />}
      {tab === "orders" && <OrdersTab />}
      {tab === "properties" && <PropertiesTab />}
      {tab === "services" && <ServicesTab />}
      {tab === "service-types" && <ServiceTypesTab />}
      {tab === "brokers" && <BrokersTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "notices" && <NoticesTab />}
      {tab === "travel" && <TravelFaresTab />}
      {tab === "features" && <FeaturesTab />}
      {tab === "users" && <UsersTab selfId={user.id} />}
      {tab === "activity" && <ActivityTab />}
    </Stack>
  );
}

function StatCard({ label, value, hint, onClick }: { label: string; value: number | string; hint?: string; onClick?: () => void }) {
  return (
    <Box
      component={onClick ? "button" : "div"}
      onClick={onClick}
      sx={[
        surfaceSx,
        {
          textAlign: "left",
          font: "inherit",
          cursor: onClick ? "pointer" : "default",
          transition: "border-color 160ms ease",
          "&:hover": onClick ? { borderColor: "primary.main" } : {},
        },
      ]}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontFamily: '"Outfit", sans-serif', fontSize: "2rem", fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

function OverviewTab({ pendingCount, onOpen }: { pendingCount: number; onOpen: (tab: TabId) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<AdminOverview>("/api/v1/admin/overview")
      .then(setOverview)
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [pendingCount]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!overview) return <CircularProgress aria-label="Loading overview" />;

  return (
    <Stack spacing={2}>
      {pendingCount > 0 && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => onOpen("approvals")}>
              Review
            </Button>
          }
        >
          {pendingCount} {pendingCount === 1 ? "shop is" : "shops are"} waiting for your approval.
        </Alert>
      )}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" } }}>
        <StatCard label="Shops live" value={overview.shops.approved} onClick={() => onOpen("shops")} />
        <StatCard label="Waiting for approval" value={overview.shops.pending} onClick={() => onOpen("approvals")} />
        <StatCard
          label="Disabled or rejected"
          value={overview.shops.disabled + overview.shops.rejected}
          onClick={() => onOpen("shops")}
        />
        <StatCard
          label="Properties to review"
          value={overview.properties.pending}
          hint={`${overview.properties.approved + overview.properties.under_offer} live · ${overview.properties.sold} sold`}
          onClick={() => onOpen("properties")}
        />
        <StatCard
          label="Services to review"
          value={overview.services_pending}
          hint="Local providers waiting for approval"
          onClick={() => onOpen("services")}
        />
        <StatCard label="Brokers to verify" value={overview.brokers_pending} onClick={() => onOpen("brokers")} />
        <StatCard label="Open reports" value={overview.reports_open} onClick={() => onOpen("reports")} />
        <StatCard label="Open orders" value={overview.orders_open} hint="Grocery and food waiting on the desk" onClick={() => onOpen("orders")} />
        <StatCard label="Active notices" value={overview.notices_active} onClick={() => onOpen("notices")} />
        <StatCard
          label="Sections on"
          value={`${overview.features_on}/${overview.features_total}`}
          onClick={() => onOpen("features")}
        />
        <StatCard label="Accounts" value={overview.users_total} hint={`${overview.admins} admin`} onClick={() => onOpen("users")} />
        <StatCard label="Disabled accounts" value={overview.users_disabled} onClick={() => onOpen("users")} />
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button component={RouterLink} to="/shop/new" variant="contained">
          Add a shop
        </Button>
        <Button variant="outlined" onClick={() => onOpen("city")}>
          Edit city home
        </Button>
        <Button variant="outlined" onClick={() => onOpen("orders")}>
          Manage orders
        </Button>
        <Button variant="outlined" onClick={() => onOpen("notices")}>
          Publish a notice
        </Button>
        <Button variant="outlined" onClick={() => onOpen("travel")}>
          Edit travel fares
        </Button>
        <Button variant="outlined" onClick={() => onOpen("service-types")}>
          Edit service types
        </Button>
        <Button variant="outlined" onClick={() => onOpen("features")}>
          Turn sections on or off
        </Button>
        <Button variant="outlined" onClick={() => onOpen("activity")}>
          See recent changes
        </Button>
      </Stack>
    </Stack>
  );
}

function ShopsTab({
  shops,
  onChange,
  onRemoved,
}: {
  shops: BusinessProfile[] | null;
  onChange: (shop: BusinessProfile) => void;
  onRemoved: (id: string) => void;
}) {
  const [status, setStatus] = useState<ShopStatus | "all">("all");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      shops?.filter(
        (shop) =>
          (status === "all" || shop.status === status) &&
          (!needle || shop.name.toLowerCase().includes(needle) || shop.ward_name.toLowerCase().includes(needle)),
      ) ?? null,
    [shops, status, needle],
  );

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <TextField label="Search shops" value={query} onChange={(event) => setQuery(event.target.value)} size="small" sx={{ flex: 1, maxWidth: 360 }} />
        <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as ShopStatus | "all")} size="small" sx={{ minWidth: 200 }}>
          <MenuItem value="all">All shops</MenuItem>
          {(Object.keys(STATUS_CHIP) as ShopStatus[]).map((key) => (
            <MenuItem key={key} value={key}>
              {STATUS_CHIP[key].label}
            </MenuItem>
          ))}
        </TextField>
        <Button component={RouterLink} to="/shop/new" variant="contained" sx={{ flex: "0 0 auto" }}>
          Add a shop
        </Button>
      </Stack>
      <ShopList shops={filtered} filter={null} empty="No shops match." onChange={onChange} onRemoved={onRemoved} />
    </Stack>
  );
}

function OrdersTab() {
  const load = useCallback(async () => (await adminCommerceOrders()).data, []);
  const { orders, error, reload } = useIncomingOrders(load);
  return (
    <OrdersDesk
      orders={orders}
      error={error}
      empty="No grocery or food orders in this view. New checkouts show up here for acceptance."
      onReload={reload}
      admin
    />
  );
}

function ShopList({
  shops,
  filter,
  empty,
  onChange,
  onRemoved,
}: {
  shops: BusinessProfile[] | null;
  filter: ShopStatus | null;
  empty: string;
  onChange: (shop: BusinessProfile) => void;
  onRemoved: (id: string) => void;
}) {
  if (!shops) return <CircularProgress aria-label="Loading shops" />;
  const rows = filter ? shops.filter((shop) => shop.status === filter) : shops;
  if (rows.length === 0) {
    return (
      <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
        <Typography color="text.secondary">{empty}</Typography>
      </Box>
    );
  }
  return (
    <Stack spacing={1.5}>
      {rows.map((shop) => (
        <ShopRow key={shop.id} shop={shop} onChange={onChange} onRemoved={() => onRemoved(shop.id)} />
      ))}
    </Stack>
  );
}

function ShopRow({ shop, onChange, onRemoved }: { shop: BusinessProfile; onChange: (shop: BusinessProfile) => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(shop.status === "pending");
  const chip = STATUS_CHIP[shop.status];

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

  const setStatus = (status: "approved" | "rejected" | "disabled", ask?: string) =>
    run(async () => {
      let note: string | null = null;
      if (ask) {
        const answer = window.prompt(ask, "");
        if (answer === null) return;
        note = answer;
      }
      onChange(await apiRequest<BusinessProfile>(`/api/v1/businesses/${shop.slug}/status`, { method: "POST", body: { status, note } }));
    });

  const toggle = (kind: "items" | "services", id: string, available: boolean) =>
    run(async () => {
      onChange(
        await apiRequest<BusinessProfile>(`/api/v1/businesses/${shop.slug}/${kind}/${id}`, {
          method: "PATCH",
          body: { is_available: available },
        }),
      );
    });

  const remove = () =>
    run(async () => {
      if (!window.confirm(`Remove ${shop.name} permanently? This cannot be undone.`)) return;
      await apiRequest<void>(`/api/v1/businesses/${shop.slug}`, { method: "DELETE" });
      onRemoved();
    });

  return (
    <Box sx={surfaceSx}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{shop.name}</Typography>
            <Chip label={chip.label} color={chip.color} size="small" variant={shop.status === "approved" ? "filled" : "outlined"} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {SHOP_CATEGORY[shop.category] ?? shop.category} · {shop.ward_name} · {shop.address_text}
          </Typography>
          {shop.review_note && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Note: {shop.review_note}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, flex: "0 0 auto" }}>
          {shop.status === "pending" && (
            <>
              <Button variant="contained" color="success" startIcon={<CheckCircleOutlineIcon />} disabled={busy} onClick={() => void setStatus("approved")}>
                Approve
              </Button>
              <Button variant="outlined" color="error" startIcon={<HighlightOffIcon />} disabled={busy} onClick={() => void setStatus("rejected", "Why is this shop rejected? The owner sees this note.")}>
                Reject
              </Button>
            </>
          )}
          {shop.status === "approved" && (
            <Button variant="outlined" disabled={busy} onClick={() => void setStatus("disabled", "Reason for disabling (optional)")}>
              Disable
            </Button>
          )}
          {(shop.status === "disabled" || shop.status === "rejected") && (
            <Button variant="outlined" color="success" disabled={busy} onClick={() => void setStatus("approved")}>
              {shop.status === "disabled" ? "Enable" : "Approve"}
            </Button>
          )}
          {shop.status === "approved" && (
            <Button component={RouterLink} to={shop.profile_path}>
              View
            </Button>
          )}
          <Button onClick={() => setOpen((current) => !current)}>{open ? "Hide details" : "Details"}</Button>
          <Button color="error" disabled={busy} onClick={() => void remove()}>
            Remove
          </Button>
        </Stack>
      </Stack>

      {open && (
        <Box sx={{ mt: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <Box sx={insetSurfaceSx}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>About</Typography>
            <Typography variant="body2">{shop.about}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Hours {shop.opening_hours}
              {shop.phone ? ` · ${shop.phone}` : ""}
            </Typography>
          </Box>
          <Box sx={insetSurfaceSx}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Catalog and services</Typography>
            {shop.catalog.map((item) => (
              <ListingSwitch
                key={item.id}
                label={`${item.name} · ${rupees(item.price_paise)}`}
                checked={item.is_available}
                disabled={busy}
                onChange={(next) => void toggle("items", item.id, next)}
              />
            ))}
            {shop.services.map((service) => (
              <ListingSwitch
                key={service.id}
                label={`${service.name} · ${servicePrice(service.price_paise)}${service.duration_minutes !== null ? ` · ${minutes(service.duration_minutes)}` : ""}`}
                checked={service.is_available}
                disabled={busy}
                onChange={(next) => void toggle("services", service.id, next)}
              />
            ))}
          </Box>
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}

function ListingSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
      <Typography variant="body2" sx={{ color: checked ? "text.primary" : "text.secondary", textDecoration: checked ? "none" : "line-through" }}>
        {label}
      </Typography>
      <Switch size="small" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} slotProps={{ input: { "aria-label": `${label} available` } }} />
    </Stack>
  );
}

const REPORT_FLOW: { status: ReportStatus; label: string; ask?: string }[] = [
  { status: "in_progress", label: "Start work" },
  { status: "resolved", label: "Mark resolved", ask: "Note for the resident (optional)" },
  { status: "rejected", label: "Close", ask: "Why is this report closed? The resident sees this note." },
  { status: "submitted", label: "Reopen" },
];

function ReportsTab() {
  const [status, setStatus] = useState<ReportStatus | "open" | "all">("open");
  const [reports, setReports] = useState<CivicReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: CivicReport[] }>("/api/v1/admin/reports")
      .then((payload) => setReports(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  async function move(report: CivicReport, next: (typeof REPORT_FLOW)[number]) {
    let note = report.admin_note;
    if (next.ask) {
      const answer = window.prompt(next.ask, report.admin_note ?? "");
      if (answer === null) return;
      note = answer;
    }
    setBusy(report.id);
    setError(null);
    try {
      const updated = await apiRequest<CivicReport>(`/api/v1/admin/reports/${report.id}`, {
        method: "PATCH",
        body: { status: next.status, note },
      });
      setReports((rows) => rows?.map((row) => (row.id === updated.id ? updated : row)) ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  if (!reports) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading reports" />;
  const rows = reports.filter((report) =>
    status === "all" ? true : status === "open" ? report.status === "submitted" || report.status === "in_progress" : report.status === status,
  );

  return (
    <Stack spacing={2}>
      <TextField select label="Show" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} size="small" sx={{ maxWidth: 240 }}>
        <MenuItem value="open">Open reports</MenuItem>
        <MenuItem value="all">All reports</MenuItem>
        {Object.entries(REPORT_STATUS).map(([key, item]) => (
          <MenuItem key={key} value={key}>
            {item.label}
          </MenuItem>
        ))}
      </TextField>
      {error && <Alert severity="error">{error}</Alert>}
      {rows.length === 0 && (
        <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
          <Typography color="text.secondary">No reports in this view. Reports residents file show up here.</Typography>
        </Box>
      )}
      {rows.map((report) => {
        const chip = REPORT_STATUS[report.status];
        return (
          <Box key={report.id} sx={surfaceSx}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>
                    {report.category} · {report.place}
                  </Typography>
                  <Chip label={chip.label} color={chip.color} size="small" variant="outlined" />
                </Stack>
                <Typography sx={{ mt: 0.5 }}>{report.details}</Typography>
                <MediaDialogButton items={galleryOf(report.media)} title={`${report.category} · ${report.place}`} />
                {report.admin_note && (
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
                    Note: {report.admin_note}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {report.user_name} · {report.ward_name ?? "No ward"} · {new Date(report.created_at).toLocaleString()}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, flex: "0 0 auto" }}>
                {REPORT_FLOW.filter((step) => step.status !== report.status && (step.status !== "submitted" || report.status === "resolved" || report.status === "rejected")).map((step) => (
                  <Button
                    key={step.status}
                    size="small"
                    variant={step.status === "resolved" ? "contained" : "outlined"}
                    color={step.status === "resolved" ? "success" : step.status === "rejected" ? "inherit" : "primary"}
                    disabled={busy === report.id}
                    onClick={() => void move(report, step)}
                  >
                    {step.label}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

const SEVERITY: Record<string, { label: string; color: "info" | "warning" | "error" }> = {
  info: { label: "Info", color: "info" },
  warning: { label: "Warning", color: "warning" },
  emergency: { label: "Emergency", color: "error" },
};

function NoticesTab() {
  const { wards } = useWard();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("info");
  const [ward, setWard] = useState("");
  const [hours, setHours] = useState("24");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiGet<{ data: Notice[] }>("/api/v1/admin/notices")
      .then((payload) => setNotices(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 4 || body.trim().length < 8) {
      setError("Give the notice a title and at least one sentence of detail.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const created = await apiRequest<Notice>("/api/v1/admin/notices", {
        method: "POST",
        body: { title: title.trim(), body: body.trim(), severity, ward_id: ward || null, hours: Number(hours) },
      });
      setNotices((rows) => [created, ...(rows ?? [])]);
      setTitle("");
      setBody("");
      setDone(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function end(notice: Notice) {
    if (!window.confirm(`End "${notice.title}" now? Residents stop seeing it.`)) return;
    try {
      await apiRequest<void>(`/api/v1/admin/notices/${notice.id}`, { method: "DELETE" });
      setNotices((rows) => rows?.filter((row) => row.id !== notice.id) ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 380px" }, alignItems: "start" }}>
      <Stack spacing={1.25}>
        <Typography variant="h2">Live notices</Typography>
        {!notices && !error && <CircularProgress aria-label="Loading notices" />}
        {notices?.length === 0 && <Typography color="text.secondary">No notices are live right now.</Typography>}
        {notices?.map((notice) => (
          <Box key={notice.id} sx={surfaceSx}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
              <Chip label={SEVERITY[notice.severity]?.label ?? notice.severity} color={SEVERITY[notice.severity]?.color ?? "info"} size="small" variant="outlined" />
              <Typography sx={{ fontWeight: 700 }}>{notice.title}</Typography>
            </Stack>
            <Typography sx={{ mt: 0.5 }}>{notice.body}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <Typography variant="body2" color="text.secondary">
                {notice.ward_id ? wards.find((item) => item.id === notice.ward_id)?.name ?? "One ward" : "All wards"} · until{" "}
                {new Date(notice.ends_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </Typography>
              <Button size="small" color="error" onClick={() => void end(notice)}>
                End now
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

      <Box component="form" onSubmit={publish} sx={surfaceSx}>
        <Stack spacing={1.5}>
          <Typography variant="h2">Publish a notice</Typography>
          <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <TextField label="Message" value={body} onChange={(event) => setBody(event.target.value)} required multiline minRows={3} />
          <TextField select label="Type" value={severity} onChange={(event) => setSeverity(event.target.value)}>
            {Object.entries(SEVERITY).map(([key, item]) => (
              <MenuItem key={key} value={key}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Who sees it" value={ward} onChange={(event) => setWard(event.target.value)}>
            <MenuItem value="">All wards</MenuItem>
            {wards.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Show for" value={hours} onChange={(event) => setHours(event.target.value)}>
            <MenuItem value="6">6 hours</MenuItem>
            <MenuItem value="24">1 day</MenuItem>
            <MenuItem value="72">3 days</MenuItem>
            <MenuItem value="168">1 week</MenuItem>
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
          {done && <Alert severity="success">Published. Residents see it on City home and Notices.</Alert>}
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "Publishing…" : "Publish notice"}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

function TravelFaresTab() {
  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Kilometre rates, night surcharge, and extra charges such as booking fees or tolls. Vehicles are still added on
        Travel.
      </Typography>
      <Button component={RouterLink} to="/travel" variant="outlined" sx={{ alignSelf: "flex-start" }}>
        Open travel desk
      </Button>
      <FareDesk />
    </Stack>
  );
}

function FeaturesTab() {
  const { setFlag } = useFeatures();
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: Feature[] }>("/api/v1/admin/features")
      .then((payload) => setFeatures(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  async function toggle(feature: Feature, enabled: boolean) {
    setSaving(feature.key);
    setError(null);
    try {
      const next = await apiRequest<Feature>(`/api/v1/admin/features/${feature.key}`, { method: "PATCH", body: { enabled } });
      setFeatures((rows) => rows?.map((row) => (row.key === next.key ? next : row)) ?? null);
      setFlag(next.key, next.enabled);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(null);
    }
  }

  if (!features) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading features" />;
  const groups = [...new Set(features.map((feature) => feature.group))];

  return (
    <Stack spacing={2.5}>
      <Typography color="text.secondary">
        Switched-off sections disappear from the menu for residents. As an admin you can still open them to check them.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {groups.map((group) => (
        <Stack key={group} spacing={1}>
          <Typography variant="h2">{group}</Typography>
          <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            {features
              .filter((feature) => feature.group === group)
              .map((feature) => (
                <Box
                  key={feature.key}
                  component="label"
                  sx={[surfaceSx, { display: "flex", alignItems: "center", gap: 1.5, cursor: "pointer", opacity: feature.enabled ? 1 : 0.75 }]}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{feature.label}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: feature.enabled ? "success.main" : "text.secondary" }}>
                    {feature.enabled ? "On" : "Off"}
                  </Typography>
                  <Switch
                    checked={feature.enabled}
                    disabled={saving === feature.key}
                    onChange={(event) => void toggle(feature, event.target.checked)}
                    slotProps={{ input: { "aria-label": feature.label } }}
                  />
                </Box>
              ))}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

function UsersTab({ selfId }: { selfId: string }) {
  const { wards } = useWard();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiGet<{ data: AdminUserRow[] }>("/api/v1/admin/users")
      .then((payload) => setUsers(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  async function update(row: AdminUserRow, patch: Partial<Pick<AdminUserRow, "status" | "role">>) {
    setBusy(row.id);
    setError(null);
    try {
      const next = await apiRequest<AdminUserRow>(`/api/v1/admin/users/${row.id}`, { method: "PATCH", body: patch });
      setUsers((rows) => rows?.map((item) => (item.id === next.id ? next : item)) ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  if (!users) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress aria-label="Loading users" />;
  const needle = query.trim().toLowerCase();
  const rows = users.filter(
    (row) => !needle || row.display_name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle),
  );

  return (
    <Stack spacing={2}>
      <TextField label="Search by name or email" value={query} onChange={(event) => setQuery(event.target.value)} size="small" sx={{ maxWidth: 360 }} />
      {error && <Alert severity="error">{error}</Alert>}
      <Stack spacing={1}>
        {rows.map((row) => {
          const self = row.id === selfId;
          const active = row.status === "active";
          return (
            <Box
              key={row.id}
              sx={[surfaceSx, { display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1.5, alignItems: { sm: "center" }, opacity: active ? 1 : 0.7 }]}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 700 }}>{row.display_name}</Typography>
                  {self && <Chip label="You" size="small" />}
                  {!active && <Chip label="Disabled" size="small" variant="outlined" />}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                  {row.email} · {wards.find((ward) => ward.id === row.ward_id)?.name ?? "No ward"} · joined{" "}
                  {new Date(row.created_at).toLocaleDateString()}
                </Typography>
              </Box>
              <TextField
                select
                size="small"
                label="Role"
                value={row.role}
                disabled={self || busy === row.id}
                onChange={(event) => void update(row, { role: event.target.value as AdminUserRow["role"] })}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="resident">Resident</MenuItem>
                <MenuItem value="admin">City admin</MenuItem>
              </TextField>
              <Stack direction="row" sx={{ alignItems: "center" }}>
                <Typography variant="body2" sx={{ minWidth: 64 }}>
                  {active ? "Can sign in" : "Blocked"}
                </Typography>
                <Switch
                  checked={active}
                  disabled={self || busy === row.id}
                  onChange={(event) => void update(row, { status: event.target.checked ? "active" : "disabled" })}
                  slotProps={{ input: { "aria-label": `${row.display_name} can sign in` } }}
                />
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}

function ActivityTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: AuditEntry[] }>("/api/v1/admin/audit?limit=100")
      .then((payload) => setEntries(payload.data))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!entries) return <CircularProgress aria-label="Loading activity" />;
  if (entries.length === 0) {
    return (
      <Box sx={[insetSurfaceSx, { textAlign: "center", py: 4 }]}>
        <Typography color="text.secondary">No changes yet. Approvals, switches, and user changes are recorded here.</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1}>
      {entries.map((entry, index) => (
        <Box key={`${entry.created_at}-${index}`} sx={[insetSurfaceSx, { display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "baseline" }]}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 150 }}>
            {new Date(entry.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </Typography>
          <Typography variant="body2">
            <strong>{entry.actor_name}</strong> · {entry.action} · {entry.target}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
