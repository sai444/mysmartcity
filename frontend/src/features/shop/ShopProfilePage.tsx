import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiGet, errorMessage } from "../../api/client";
import type { BusinessProfile } from "../../api/types";
import { surfaceSx as surfaceSx } from "../../theme/surfaces";
import { LiveWeather } from "../city/LiveWeather";
import { minutes, rupees, servicePrice, SHOP_CATEGORY } from "../city/labels";
import { PlaceMap } from "../map/PlaceMap";
import { coverUrl } from "../media/api";
import { galleryOf, MediaDialogButton, MediaGallery } from "../media/MediaGallery";
import { ItemThumb } from "./ItemPhoto";
import { ShopQr } from "./ShopQr";

export default function ShopProfilePage() {
  const { slug } = useParams();
  const [shop, setShop] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setShop(null);
    setError(null);
    apiGet<BusinessProfile>(`/api/v1/businesses/${encodeURIComponent(slug)}`)
      .then((payload) => {
        if (active) setShop(payload);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (error) {
    return (
      <Stack spacing={2}>
        <Typography variant="h1">Shop</Typography>
        <Alert severity="error">{error}</Alert>
      </Stack>
    );
  }

  if (!shop) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Loading shop" />
      </Box>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography variant="h1">{shop.name}</Typography>
        <Typography color="text.secondary">
          {SHOP_CATEGORY[shop.category] ?? shop.category} · {shop.ward_name}
        </Typography>
      </Stack>
      <Typography>{shop.about}</Typography>
      {Boolean(shop.media?.length) && (
        <Box sx={[surfaceSx, { p: { xs: 1, sm: 1.5 } }]}>
          <MediaGallery items={galleryOf(shop.media)} title={shop.name} height={380} />
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.4fr) minmax(260px, 0.8fr)" },
          alignItems: "start",
        }}
      >
        <Stack spacing={2}>
          <Box sx={surfaceSx}>
            <Typography sx={{ fontWeight: 700 }}>Visit</Typography>
            <Typography>{shop.address_text}</Typography>
            <Typography>Hours {shop.opening_hours}</Typography>
            {shop.phone && <Typography>Phone {shop.phone}</Typography>}
          </Box>
          {shop.services.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="h2">Services</Typography>
              {shop.services.map((service) => (
                <Box key={service.id} sx={surfaceSx}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={{ xs: 0.25, sm: 2 }}
                    sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "baseline" }, minWidth: 0 }}
                  >
                    <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{service.name}</Typography>
                    <Typography sx={{ flex: "0 0 auto" }}>{servicePrice(service.price_paise)}</Typography>
                  </Stack>
                  {(service.description || service.duration_minutes !== null) && (
                    <Typography variant="body2" color="text.secondary">
                      {[service.duration_minutes !== null ? minutes(service.duration_minutes) : null, service.description || null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Typography>
                  )}
                  {!service.is_available && (
                    <Typography variant="body2" color="text.secondary">
                      Not offered today
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
          {shop.catalog.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="h2">Catalog</Typography>
              {shop.catalog.map((item) => (
                <Box key={item.id} sx={[surfaceSx, { display: "flex", gap: 1.5, alignItems: "flex-start" }]}>
                  <ItemThumb src={item.image ?? coverUrl(item.media)} alt={item.name} size={72} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={{ xs: 0.25, sm: 2 }}
                      sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "baseline" }, minWidth: 0 }}
                    >
                      <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{item.name}</Typography>
                      <Typography sx={{ flex: "0 0 auto" }}>{rupees(item.price_paise)}</Typography>
                    </Stack>
                    {item.description && (
                      <Typography variant="body2" color="text.secondary">
                        {item.description}
                      </Typography>
                    )}
                    {!item.is_available && (
                      <Typography variant="body2" color="text.secondary">
                        Not available today
                      </Typography>
                    )}
                    <MediaDialogButton items={galleryOf(item.media)} title={item.name} />
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
          <PlaceMap
            center={{ latitude: shop.latitude, longitude: shop.longitude }}
            zoom={16}
            height={280}
            pins={[
              {
                id: shop.id,
                name: shop.name,
                latitude: shop.latitude,
                longitude: shop.longitude,
                color: "#0f766e",
                label: SHOP_CATEGORY[shop.category] ?? shop.category,
                detail: shop.address_text,
              },
            ]}
          />
          <LiveWeather latitude={shop.latitude} longitude={shop.longitude} compact />
        </Stack>
        <Box sx={surfaceSx}>
          <ShopQr path={shop.profile_path} name={shop.name} />
        </Box>
      </Box>
    </Stack>
  );
}
