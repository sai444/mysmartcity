import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { Box, Button, Chip, CircularProgress, Rating, Stack, Tab, Tabs, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { surfaceSx } from "../../theme/surfaces";
import { rupees } from "../city/labels";
import { assetUrl, CATEGORY_LABEL, CONDITION_LABEL, LISTING_STATUS, type ListingSummary } from "./api";

export function MarketTabs() {
  const { pathname } = useLocation();
  const current = pathname.startsWith("/market/sell") ? "/market/sell" : pathname.startsWith("/market/mine") ? "/market/mine" : "/market";
  return (
    <Tabs value={current} variant="scrollable" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Tab label="Browse" value="/market" component={RouterLink} to="/market" />
      <Tab label="Sell an item" value="/market/sell" component={RouterLink} to="/market/sell" />
      <Tab label="My market" value="/market/mine" component={RouterLink} to="/market/mine" />
    </Tabs>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress aria-label={label} />
    </Box>
  );
}

export function RatingLine({ value, count, size = "small" }: { value: number | null; count: number; size?: "small" | "medium" }) {
  if (!count || value === null) {
    return (
      <Typography variant="body2" color="text.secondary">
        No reviews yet
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Rating value={value} precision={0.5} readOnly size={size} />
      <Typography variant="body2" color="text.secondary">
        {value.toFixed(1)} · {count} {count === 1 ? "review" : "reviews"}
      </Typography>
    </Stack>
  );
}

export function Cover({ src, alt, height = 160 }: { src: string | null; alt: string; height?: number }) {
  const url = assetUrl(src);
  return url ? (
    <Box component="img" src={url} alt={alt} loading="lazy" sx={{ width: "100%", height, objectFit: "cover", display: "block", bgcolor: "action.hover" }} />
  ) : (
    <Box sx={{ width: "100%", height, display: "grid", placeItems: "center", bgcolor: "action.hover", color: "text.disabled" }}>
      <ImageOutlinedIcon fontSize="large" aria-label="No photo" />
    </Box>
  );
}

export function ListingCard({ item }: { item: ListingSummary }) {
  const soldOut = item.status === "sold_out";
  return (
    <Box
      component={RouterLink}
      to={`/market/${item.id}`}
      sx={[
        surfaceSx,
        {
          p: 0,
          overflow: "hidden",
          textDecoration: "none",
          color: "inherit",
          display: "flex",
          flexDirection: "column",
          opacity: soldOut ? 0.65 : 1,
          transition: "box-shadow 120ms",
          "&:hover, &:focus-visible": { boxShadow: 3 },
        },
      ]}
    >
      <Cover src={item.cover_url} alt={item.title} />
      <Stack spacing={0.5} sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{item.title}</Typography>
          <Typography sx={{ fontWeight: 700, flex: "0 0 auto" }}>{rupees(item.price_paise)}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {CATEGORY_LABEL[item.category]} · {CONDITION_LABEL[item.condition]} · {item.ward_name}
        </Typography>
        <RatingLine value={item.rating_avg} count={item.review_count} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {item.seller_name}
          </Typography>
          {soldOut && <Chip size="small" label="Sold out" color="warning" />}
          {!soldOut && item.quantity > 1 && <Chip size="small" label={`${item.quantity} left`} />}
        </Stack>
      </Stack>
    </Box>
  );
}

export function StatusChip({ status }: { status: ListingSummary["status"] }) {
  const meta = LISTING_STATUS[status];
  return <Chip size="small" label={meta.label} color={meta.color} />;
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Button component={RouterLink} to={to} startIcon={<ArrowBackIcon />} sx={{ alignSelf: "flex-start" }}>
      {label}
    </Button>
  );
}
