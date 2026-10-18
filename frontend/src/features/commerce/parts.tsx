import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
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
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { rupees } from "../city/labels";
import { addToCart, cartCount, cartTotal, replaceCart, setCartQty, useLife, type CartLine, type Channel } from "../life/store";
import { Surface } from "../life/ui";
import { itemCover } from "../media/api";
import { CHANNELS, deliveryFee, shopCount, type Product } from "./catalog";

const FLOW = ["Browse", "Cart", "Checkout", "Track"];

export function FlowSteps({ active }: { active: number }) {
  return (
    <Stepper activeStep={active} aria-label="Order steps" sx={{ maxWidth: 560 }}>
      {FLOW.map((label) => (
        <Step key={label}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress aria-label={label} />
    </Box>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {message}
    </Alert>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button component={RouterLink} to={to} startIcon={<ArrowBackOutlinedIcon />} sx={{ alignSelf: "flex-start" }}>
      {children}
    </Button>
  );
}

export const cardGridSx = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
} as const;

export const twoColumnSx = {
  display: "grid",
  gap: 2,
  alignItems: "start",
  gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 340px" },
} as const;

export function channelLines(cart: CartLine[], channel: Channel) {
  return cart.filter((line) => line.channel === channel);
}

export function useChannelCart(channel: Channel) {
  const { user } = useAuth();
  const life = useLife(user?.id ?? null);
  return user ? channelLines(life.cart, channel) : [];
}

export function QtyControl({
  channel,
  product,
  line,
  fullWidth,
}: {
  channel: Channel;
  product: Product;
  line?: CartLine;
  fullWidth?: boolean;
}) {
  const { user, ready } = useAuth();
  const location = useLocation();
  const lines = useChannelCart(channel);
  const [conflict, setConflict] = useState<string | null>(null);
  const config = CHANNELS[channel];

  if (ready && !user) {
    return (
      <Button
        component={RouterLink}
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        variant="outlined"
        fullWidth={fullWidth}
      >
        Sign in to add
      </Button>
    );
  }
  if (line) return <QtyStepper channel={channel} line={line} userId={user?.id ?? null} />;

  const next = {
    itemId: product.id,
    shopSlug: product.shop.slug,
    shopName: product.shop.name,
    name: product.name,
    pricePaise: product.price_paise,
    channel,
    image: itemCover(product),
  };

  function onAdd() {
    if (!user) return;
    const other = config.singleShop ? lines.find((item) => item.shopSlug !== product.shop.slug) : undefined;
    if (other) setConflict(other.shopName);
    else addToCart(user.id, next);
  }

  return (
    <>
      <Button variant="contained" fullWidth={fullWidth} disabled={!product.is_available || !user} onClick={onAdd}>
        {product.is_available ? "Add" : "Not available"}
      </Button>
      <Dialog open={Boolean(conflict)} onClose={() => setConflict(null)}>
        <DialogTitle>Start a new order?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your cart has dishes from {conflict}. One order comes from one {config.shopNoun}, so adding {product.name} clears that
            cart.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflict(null)}>Keep current cart</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (user) replaceCart(user.id, next);
              setConflict(null);
            }}
          >
            Start new order
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function QtyStepper({ channel, line, userId }: { channel: Channel; line: CartLine; userId: string | null }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flex: "0 0 auto" }}>
      <Button
        size="small"
        variant="outlined"
        aria-label={`Remove one ${line.name}`}
        disabled={!userId}
        onClick={() => userId && setCartQty(userId, line.itemId, channel, line.qty - 1)}
        sx={{ minWidth: 36 }}
      >
        −
      </Button>
      <Typography sx={{ minWidth: 24, textAlign: "center", fontWeight: 700 }} aria-live="polite">
        {line.qty}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        aria-label={`Add one ${line.name}`}
        disabled={!userId}
        onClick={() => userId && setCartQty(userId, line.itemId, channel, line.qty + 1)}
        sx={{ minWidth: 36 }}
      >
        +
      </Button>
    </Stack>
  );
}

export function CartButton({ channel, lines }: { channel: Channel; lines: CartLine[] }) {
  const count = cartCount(lines);
  return (
    <Button
      component={RouterLink}
      to={`${CHANNELS[channel].base}/cart`}
      variant="outlined"
      startIcon={<ShoppingCartOutlinedIcon />}
      sx={{ flex: "0 0 auto" }}
    >
      Cart{count ? ` (${count})` : ""}
    </Button>
  );
}

export function CartBar({ channel, lines }: { channel: Channel; lines: CartLine[] }) {
  const count = cartCount(lines);
  if (!count) return null;
  const shop = CHANNELS[channel].singleShop ? ` from ${lines[0].shopName}` : "";
  return (
    <Box sx={{ position: "sticky", bottom: 16, zIndex: 2 }}>
      <Surface>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 700 }}>
            {count} {count === 1 ? "item" : "items"}
            {shop} · {rupees(cartTotal(lines))}
          </Typography>
          <Button component={RouterLink} to={`${CHANNELS[channel].base}/cart`} variant="contained" sx={{ flex: "0 0 auto" }}>
            View cart
          </Button>
        </Stack>
      </Surface>
    </Box>
  );
}

export function Summary({ channel, lines, children }: { channel: Channel; lines: CartLine[]; children?: ReactNode }) {
  const subtotal = cartTotal(lines);
  const fee = deliveryFee(channel, lines);
  const shops = shopCount(lines);
  return (
    <Surface>
      <Stack spacing={1}>
        <Typography variant="h2">Bill</Typography>
        <Row label={`Items (${cartCount(lines)})`} value={rupees(subtotal)} />
        <Row label={shops > 1 ? `Delivery (${shops} shops)` : "Delivery"} value={rupees(fee)} />
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1 }}>
          <Row label="To pay" value={rupees(subtotal + fee)} strong />
        </Box>
        {children}
      </Stack>
    </Surface>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between" }}>
      <Typography sx={{ fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Typography sx={{ fontWeight: strong ? 700 : 400 }}>{value}</Typography>
    </Stack>
  );
}
