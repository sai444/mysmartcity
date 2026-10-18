import { Alert, Box, Chip, Link, Stack, TextField, Typography } from "@mui/material";
import { useMemo } from "react";
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom";

import { rupees } from "../city/labels";
import { productsOf, useShops, type Product } from "../commerce/catalog";
import { BackLink, CartBar, CartButton, LoadError, Loading, QtyControl, cardGridSx, useChannelCart } from "../commerce/parts";
import type { CartLine } from "../life/store";
import { PageIntro, Surface } from "../life/ui";
import { itemCover } from "../media/api";
import { galleryOf, MediaDialogButton, MediaGallery } from "../media/MediaGallery";

function ProductCard({ product, line }: { product: Product; line?: CartLine }) {
  const cover = itemCover(product);
  return (
    <Surface>
      <Stack spacing={1} sx={{ height: "100%" }}>
        {cover ? (
          <Box
            component="img"
            src={cover}
            alt={product.name}
            loading="lazy"
            sx={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 1, display: "block" }}
          />
        ) : (
          <Box sx={{ width: "100%", height: 140, borderRadius: 1, bgcolor: "action.hover" }} />
        )}
        <Link component={RouterLink} to={`/grocery/${product.id}`} underline="hover" sx={{ fontWeight: 700, color: "text.primary" }}>
          {product.name}
        </Link>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {product.description}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {product.shop.name} · {product.shop.ward_name}
        </Typography>
        <MediaDialogButton items={galleryOf(product.media)} title={product.name} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 700 }}>{rupees(product.price_paise)}</Typography>
          <QtyControl channel="grocery" product={product} line={line} />
        </Stack>
      </Stack>
    </Surface>
  );
}

export function GroceryBrowsePage() {
  const lines = useChannelCart("grocery");
  const { shops, error, retry } = useShops("grocery");
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const shopFilter = params.get("shop") ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return productsOf(shops ?? []).filter(
      (product) =>
        (!shopFilter || product.shop.slug === shopFilter) &&
        (!needle || product.name.toLowerCase().includes(needle) || product.shop.name.toLowerCase().includes(needle)),
    );
  }, [shops, query, shopFilter]);

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-end" } }}>
        <PageIntro
          kicker="Home delivery"
          title="Grocery"
          lede="Shelves from neighbourhood kirana stores. Add what you need, check out, and follow the delivery."
        />
        <CartButton channel="grocery" lines={lines} />
      </Stack>
      <TextField label="Search" value={query} onChange={(event) => update("q", event.target.value)} fullWidth placeholder="Item or shop" />
      {error && <LoadError message={error} onRetry={retry} />}
      {!shops && !error && <Loading label="Loading grocery" />}
      {shops && (
        <>
          {shops.length > 1 && (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }} role="group" aria-label="Filter by shop">
              <Chip
                label="All shops"
                clickable
                color={!shopFilter ? "primary" : "default"}
                variant={!shopFilter ? "filled" : "outlined"}
                onClick={() => update("shop", "")}
              />
              {shops.map((shop) => (
                <Chip
                  key={shop.id}
                  label={shop.name}
                  clickable
                  color={shopFilter === shop.slug ? "primary" : "default"}
                  variant={shopFilter === shop.slug ? "filled" : "outlined"}
                  onClick={() => update("shop", shop.slug)}
                />
              ))}
            </Stack>
          )}
          {visible.length === 0 && (
            <Surface>
              <Typography color="text.secondary">
                {shops.length === 0 ? "No grocery shops are open on MyNagari yet." : "Nothing matches that search."}
              </Typography>
            </Surface>
          )}
          <Box sx={cardGridSx}>
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} line={lines.find((line) => line.itemId === product.id)} />
            ))}
          </Box>
          <CartBar channel="grocery" lines={lines} />
        </>
      )}
    </Stack>
  );
}

export function GroceryProductPage() {
  const { itemId } = useParams();
  const lines = useChannelCart("grocery");
  const { shops, error, retry } = useShops("grocery");
  const products = useMemo(() => productsOf(shops ?? []), [shops]);
  const product = products.find((item) => item.id === itemId);
  const more = product ? products.filter((item) => item.shop.id === product.shop.id && item.id !== product.id) : [];
  const line = lines.find((item) => item.itemId === itemId);

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <BackLink to="/grocery">All groceries</BackLink>
        <CartButton channel="grocery" lines={lines} />
      </Stack>
      {error && <LoadError message={error} onRetry={retry} />}
      {!shops && !error && <Loading label="Loading product" />}
      {shops && !product && (
        <Surface>
          <Typography sx={{ fontWeight: 700 }}>This item is no longer listed</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            The shop may have removed it. Try searching the grocery list.
          </Typography>
        </Surface>
      )}
      {product && (
        <>
          <Surface>
            <Stack spacing={1.5}>
              {(itemCover(product) || product.media?.length) && (
                <Box>
                  {product.media?.length ? (
                    <MediaGallery items={galleryOf(product.media)} title={product.name} height={360} />
                  ) : (
                    <Box
                      component="img"
                      src={itemCover(product) ?? undefined}
                      alt={product.name}
                      sx={{ width: "100%", maxHeight: 360, objectFit: "contain", bgcolor: "action.hover", borderRadius: 1, display: "block" }}
                    />
                  )}
                </Box>
              )}
              <PageIntro kicker={product.shop.name} title={product.name} lede={product.description} />
              <Typography variant="h2">{rupees(product.price_paise)}</Typography>
              {!product.is_available && <Alert severity="warning">Not available today.</Alert>}
              <Typography variant="body2" color="text.secondary">
                Sold by{" "}
                <Link component={RouterLink} to={product.shop.profile_path}>
                  {product.shop.name}
                </Link>{" "}
                · {product.shop.ward_name} · Open {product.shop.opening_hours}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
                <Box sx={{ minWidth: 160 }}>
                  <QtyControl channel="grocery" product={product} line={line} fullWidth />
                </Box>
                {line && <Typography color="text.secondary">In your cart · {rupees(line.pricePaise * line.qty)}</Typography>}
              </Stack>
            </Stack>
          </Surface>
          {more.length > 0 && (
            <Stack spacing={1.5}>
              <Typography variant="h2">More from {product.shop.name}</Typography>
              <Box sx={cardGridSx}>
                {more.map((item) => (
                  <ProductCard key={item.id} product={item} line={lines.find((entry) => entry.itemId === item.id)} />
                ))}
              </Box>
            </Stack>
          )}
          <CartBar channel="grocery" lines={lines} />
        </>
      )}
    </Stack>
  );
}
