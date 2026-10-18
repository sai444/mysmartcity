import { Alert, Box, Link, Stack, TextField, Typography } from "@mui/material";
import { useMemo } from "react";
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom";

import { rupees } from "../city/labels";
import { productsOf, useShops } from "../commerce/catalog";
import { BackLink, CartBar, CartButton, LoadError, Loading, QtyControl, cardGridSx, useChannelCart } from "../commerce/parts";
import { PageIntro, Surface } from "../life/ui";
import { coverUrl, itemCover } from "../media/api";
import { galleryOf, MediaDialogButton } from "../media/MediaGallery";
import { linkSurfaceSx } from "../../theme/surfaces";

export function FoodBrowsePage() {
  const lines = useChannelCart("food");
  const { shops, error, retry } = useShops("food");
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (shops ?? [])
      .map((shop) => ({
        shop,
        matches: needle ? shop.catalog.filter((item) => item.name.toLowerCase().includes(needle)) : [],
      }))
      .filter(({ shop, matches }) => !needle || shop.name.toLowerCase().includes(needle) || matches.length > 0);
  }, [shops, query]);

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-end" } }}>
        <PageIntro
          kicker="Kitchens"
          title="Food"
          lede="Pick a kitchen, add dishes from its menu, and follow the order until it reaches your door."
        />
        <CartButton channel="food" lines={lines} />
      </Stack>
      <TextField
        label="Search"
        value={query}
        onChange={(event) => setParams(event.target.value ? { q: event.target.value } : {}, { replace: true })}
        fullWidth
        placeholder="Restaurant or dish"
      />
      {error && <LoadError message={error} onRetry={retry} />}
      {!shops && !error && <Loading label="Loading restaurants" />}
      {shops && (
        <>
          {visible.length === 0 && (
            <Surface>
              <Typography color="text.secondary">
                {shops.length === 0 ? "No restaurants are open on MyNagari yet." : "Nothing matches that search."}
              </Typography>
            </Surface>
          )}
          <Box sx={cardGridSx}>
            {visible.map(({ shop, matches }) => {
              const dishes = matches.length ? matches : shop.catalog;
              const available = shop.catalog.filter((item) => item.is_available).length;
              return (
                <Box key={shop.id} component={RouterLink} to={`/food/${shop.slug}`} sx={linkSurfaceSx}>
                  <Stack spacing={0.75}>
                    {coverUrl(shop.media) && (
                      <Box
                        component="img"
                        src={coverUrl(shop.media) ?? undefined}
                        alt={shop.name}
                        loading="lazy"
                        sx={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 1, display: "block" }}
                      />
                    )}
                    <Typography sx={{ fontWeight: 700 }}>{shop.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {shop.ward_name} · {shop.opening_hours}
                    </Typography>
                    <Typography variant="body2">
                      {dishes
                        .slice(0, 3)
                        .map((item) => item.name)
                        .join(" · ")}
                      {dishes.length > 3 ? " …" : ""}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {available} of {shop.catalog.length} dishes available
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Box>
          <CartBar channel="food" lines={lines} />
        </>
      )}
    </Stack>
  );
}

export function RestaurantPage() {
  const { slug } = useParams();
  const lines = useChannelCart("food");
  const { shops, error, retry } = useShops("food");
  const shop = shops?.find((item) => item.slug === slug);
  const menu = useMemo(() => (shop ? productsOf([shop]) : []), [shop]);
  const otherCart = lines.length > 0 && lines[0].shopSlug !== slug ? lines[0].shopName : null;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <BackLink to="/food">All restaurants</BackLink>
        <CartButton channel="food" lines={lines} />
      </Stack>
      {error && <LoadError message={error} onRetry={retry} />}
      {!shops && !error && <Loading label="Loading menu" />}
      {shops && !shop && (
        <Surface>
          <Typography sx={{ fontWeight: 700 }}>This restaurant is not taking orders</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            It may have closed its MyNagari page. Pick another kitchen from the list.
          </Typography>
        </Surface>
      )}
      {shop && (
        <>
          <Stack spacing={1}>
            {coverUrl(shop.media) && (
              <Box
                component="img"
                src={coverUrl(shop.media) ?? undefined}
                alt={shop.name}
                sx={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 1, display: "block" }}
              />
            )}
            <PageIntro kicker="Restaurant" title={shop.name} lede={shop.about || `${shop.ward_name} · ${shop.address_text}`} />
            <Typography variant="body2" color="text.secondary">
              {shop.ward_name} · Open {shop.opening_hours} ·{" "}
              <Link component={RouterLink} to={shop.profile_path}>
                Restaurant page
              </Link>
            </Typography>
            <MediaDialogButton items={galleryOf(shop.media)} title={shop.name} />
          </Stack>
          {otherCart && <Alert severity="info">Your cart has dishes from {otherCart}. An order comes from one restaurant, so adding a dish here will ask to start a new cart.</Alert>}
          {menu.length === 0 && (
            <Surface>
              <Typography color="text.secondary">The menu is empty right now.</Typography>
            </Surface>
          )}
          <Stack spacing={1.25}>
            {menu.map((dish) => (
              <Surface key={dish.id}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
                >
                  {itemCover(dish) && (
                    <Box
                      component="img"
                      src={itemCover(dish) ?? undefined}
                      alt={dish.name}
                      loading="lazy"
                      sx={{ width: { xs: "100%", sm: 88 }, height: { xs: 160, sm: 88 }, objectFit: "cover", borderRadius: 1, flex: "0 0 auto" }}
                    />
                  )}
                  <Stack sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 700 }}>{dish.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {dish.description}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, mt: 0.5 }}>{rupees(dish.price_paise)}</Typography>
                    <MediaDialogButton items={galleryOf(dish.media)} title={dish.name} />
                  </Stack>
                  <QtyControl channel="food" product={dish} line={lines.find((line) => line.itemId === dish.id)} />
                </Stack>
              </Surface>
            ))}
          </Stack>
          <CartBar channel="food" lines={lines} />
        </>
      )}
    </Stack>
  );
}
