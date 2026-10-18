import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState, type FormEvent } from "react";
import { Link as RouterLink, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { rupees } from "../city/labels";
import { errorMessage } from "../../api/client";
import { cartTotal, clearChannelCart, removeFromCart, useLife, type CartLine, type Channel, type PaymentMethod } from "../life/store";
import { placeCommerceOrder } from "../orders/api";
import { PageIntro, Surface } from "../life/ui";
import { ItemThumb } from "../shop/ItemPhoto";
import { CHANNELS, deliveryFee, productsOf, shopCount, useShops } from "./catalog";
import { BackLink, FlowSteps, Loading, QtyStepper, Summary, channelLines, twoColumnSx } from "./parts";

function byShop(lines: CartLine[]) {
  const groups = new Map<string, CartLine[]>();
  for (const line of lines) groups.set(line.shopName, [...(groups.get(line.shopName) ?? []), line]);
  return [...groups.entries()];
}

export function CartPage({ channel }: { channel: Channel }) {
  const config = CHANNELS[channel];
  const { user, ready } = useAuth();
  const life = useLife(user?.id ?? null);
  const lines = user ? channelLines(life.cart, channel) : [];
  const back = config.singleShop && lines.length ? `${config.base}/${lines[0].shopSlug}` : config.base;

  return (
    <Stack spacing={2.5}>
      <BackLink to={back}>{config.singleShop && lines.length ? "Back to menu" : "Keep shopping"}</BackLink>
      <FlowSteps active={1} />
      <PageIntro title={config.cartTitle} lede="Check quantities before you choose an address and payment." />
      {!ready && <Loading label="Loading cart" />}
      {ready && !user && (
        <Surface>
          <Typography sx={{ fontWeight: 700 }}>Sign in to see your cart</Typography>
          <Button
            component={RouterLink}
            to={`/login?next=${encodeURIComponent(`${config.base}/cart`)}`}
            variant="contained"
            sx={{ mt: 1.5 }}
          >
            Sign in
          </Button>
        </Surface>
      )}
      {user && lines.length === 0 && (
        <Surface>
          <Typography sx={{ fontWeight: 700 }}>Your cart is empty</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
            {config.emptyCart}
          </Typography>
          <Button component={RouterLink} to={config.base} variant="contained">
            {config.browseLabel}
          </Button>
        </Surface>
      )}
      {user && lines.length > 0 && (
        <Box sx={twoColumnSx}>
          <Stack spacing={2}>
            {byShop(lines).map(([shopName, shopLines]) => (
              <Surface key={shopName}>
                <Stack spacing={1.25}>
                  <Typography sx={{ fontWeight: 700 }}>{shopName}</Typography>
                  {shopLines.map((line) => (
                    <Stack
                      key={line.itemId}
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{
                        justifyContent: "space-between",
                        alignItems: { sm: "center" },
                        pt: 1.25,
                        borderTop: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: "center", flex: 1 }}>
                        <ItemThumb src={line.image} alt={line.name} size={56} />
                        <Stack sx={{ minWidth: 0 }}>
                        <Link
                          component={RouterLink}
                          to={config.itemPath(line)}
                          underline="hover"
                          sx={{ fontWeight: 700, color: "text.primary" }}
                        >
                          {line.name}
                        </Link>
                        <Typography variant="body2" color="text.secondary">
                          {rupees(line.pricePaise)} each · {rupees(line.pricePaise * line.qty)}
                        </Typography>
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <QtyStepper channel={channel} line={line} userId={user.id} />
                        <Button size="small" color="inherit" onClick={() => removeFromCart(user.id, line.itemId, channel)}>
                          Remove
                        </Button>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              </Surface>
            ))}
          </Stack>
          <Summary channel={channel} lines={lines}>
            <Button component={RouterLink} to={`${config.base}/checkout`} variant="contained" size="large" sx={{ mt: 1 }}>
              Proceed to checkout
            </Button>
          </Summary>
        </Box>
      )}
    </Stack>
  );
}

export function CheckoutPage({ channel }: { channel: Channel }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading label="Loading checkout" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`${CHANNELS[channel].base}/checkout`)}`} replace />;
  return <CheckoutForm channel={channel} userId={user.id} defaultAddress={user.default_address ?? ""} />;
}

function CheckoutForm({ channel, userId, defaultAddress }: { channel: Channel; userId: string; defaultAddress: string }) {
  const config = CHANNELS[channel];
  const life = useLife(userId);
  const navigate = useNavigate();
  const { shops } = useShops(channel);
  const [address, setAddress] = useState(defaultAddress);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const lines = useMemo(() => channelLines(life.cart, channel), [life.cart, channel]);
  const shopsInCart = shopCount(lines);
  const fee = deliveryFee(channel, lines);

  const unavailable = useMemo(() => {
    if (!shops) return [];
    const products = productsOf(shops);
    return lines.filter((line) => !products.find((product) => product.id === line.itemId)?.is_available);
  }, [shops, lines]);

  if (lines.length === 0 && !submitting) return <Navigate to={`${config.base}/cart`} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!address.trim()) {
      setAddressError("Enter the address we should deliver to.");
      return;
    }
    if (unavailable.length) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const placed = await placeCommerceOrder({
        channel,
        address: address.trim(),
        note: note.trim(),
        payment,
        idempotency_key: idempotencyKey,
        lines: lines.map((line) => ({ item_id: line.itemId, shop_slug: line.shopSlug, qty: line.qty })),
      });
      clearChannelCart(userId, channel);
      if (placed.data.length === 1) navigate(`/orders/${placed.data[0].id}`, { replace: true });
      else navigate("/activity", { replace: true, state: { placed: placed.data.length } });
    } catch (reason) {
      setSubmitError(errorMessage(reason));
      setSubmitting(false);
    }
  }

  return (
    <Stack spacing={2.5}>
      <BackLink to={`${config.base}/cart`}>Back to cart</BackLink>
      <FlowSteps active={2} />
      <PageIntro title="Checkout" lede="Tell us where to deliver and how you want to pay." />
      <Box component="form" noValidate onSubmit={onSubmit} sx={twoColumnSx}>
        <Stack spacing={2}>
          <Surface>
            <Stack spacing={1.5}>
              <Typography variant="h2">Delivery address</Typography>
              <TextField
                label="Address"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setAddressError(null);
                }}
                required
                fullWidth
                multiline
                minRows={2}
                error={Boolean(addressError)}
                helperText={addressError ?? "House or flat, street, landmark."}
                autoComplete="street-address"
              />
              <TextField
                label={`Note for the ${config.shopNoun} (optional)`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                fullWidth
                placeholder={channel === "food" ? "Less spicy, no onion, extra chutney…" : "Ring the bell, leave at the gate…"}
              />
            </Stack>
          </Surface>
          <Surface>
            <FormControl>
              <FormLabel id="payment-label" sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}>
                Payment
              </FormLabel>
              <RadioGroup
                aria-labelledby="payment-label"
                value={payment}
                onChange={(event) => setPayment(event.target.value as PaymentMethod)}
              >
                <FormControlLabel value="upi" control={<Radio />} label="Pay now with UPI" />
                <FormControlLabel value="cod" control={<Radio />} label="Cash on delivery" />
              </RadioGroup>
            </FormControl>
          </Surface>
        </Stack>
        <Summary channel={channel} lines={lines}>
          <Stack spacing={0.5} sx={{ pt: 0.5 }}>
            {lines.map((line) => (
              <Typography key={line.itemId} variant="body2" color="text.secondary">
                {line.qty} × {line.name}
              </Typography>
            ))}
          </Stack>
          {submitError && <Alert severity="error">{submitError}</Alert>}
          {shopsInCart > 1 && (
            <Alert severity="info">
              Items from {shopsInCart} shops become {shopsInCart} orders. Each shop has its own delivery fee.
            </Alert>
          )}
          {unavailable.length > 0 && (
            <Alert severity="warning">
              {unavailable.map((line) => line.name).join(", ")} {unavailable.length === 1 ? "is" : "are"} not available right now.
              Remove {unavailable.length === 1 ? "it" : "them"} from your cart to continue.
            </Alert>
          )}
          <Button type="submit" variant="contained" size="large" disabled={submitting || unavailable.length > 0} sx={{ mt: 1 }}>
            {submitting
              ? "Placing order…"
              : payment === "upi"
                ? `Pay ${rupees(cartTotal(lines) + fee)} and place order`
                : shopsInCart > 1
                  ? `Place ${shopsInCart} orders`
                  : "Place order"}
          </Button>
        </Summary>
      </Box>
    </Stack>
  );
}
