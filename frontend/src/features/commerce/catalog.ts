import { useCallback, useEffect, useState } from "react";

import { apiGet, errorMessage } from "../../api/client";
import type { BusinessProfile, CatalogItem, CityMap } from "../../api/types";
import type { CartLine, Channel } from "../life/store";

export type ChannelConfig = {
  base: string;
  category: string;
  feePaise: number;
  singleShop: boolean;
  shopNoun: string;
  cartTitle: string;
  emptyCart: string;
  browseLabel: string;
  itemPath: (line: Pick<CartLine, "itemId" | "shopSlug">) => string;
};

export const CHANNELS: Record<Channel, ChannelConfig> = {
  grocery: {
    base: "/grocery",
    category: "grocery",
    feePaise: 2500,
    singleShop: false,
    shopNoun: "shop",
    cartTitle: "Your grocery cart",
    emptyCart: "Add groceries from neighbourhood shops to get started.",
    browseLabel: "Browse groceries",
    itemPath: (line) => `/grocery/${line.itemId}`,
  },
  food: {
    base: "/food",
    category: "restaurant",
    feePaise: 2500,
    singleShop: true,
    shopNoun: "restaurant",
    cartTitle: "Your food order",
    emptyCart: "Pick a kitchen and add a few dishes to get started.",
    browseLabel: "Browse restaurants",
    itemPath: (line) => `/food/${line.shopSlug}`,
  },
};

export type Product = CatalogItem & { shop: BusinessProfile };

const FRESH_MS = 60_000;
const cached = new Map<string, { at: number; shops: Promise<BusinessProfile[]> }>();

function loadShops(category: string, force: boolean) {
  const hit = cached.get(category);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return hit.shops;
  const shops = apiGet<CityMap>("/api/v1/city/map").then(async (map) => {
    const slugs = map.places
      .filter((place) => place.kind === "business" && place.subtype === category && place.href)
      .map((place) => place.href!.replace(/^\/b\//, ""));
    const rows = await Promise.all(
      slugs.map((slug) => apiGet<BusinessProfile>(`/api/v1/businesses/${encodeURIComponent(slug)}`).catch(() => null)),
    );
    return rows.filter((shop): shop is BusinessProfile => shop !== null);
  });
  const entry = { at: Date.now(), shops };
  cached.set(category, entry);
  shops.catch(() => {
    if (cached.get(category) === entry) cached.delete(category);
  });
  return shops;
}

export function useShops(channel: Channel) {
  const category = CHANNELS[channel].category;
  const [shops, setShops] = useState<BusinessProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    loadShops(category, attempt > 0)
      .then((result) => {
        if (active) setShops(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [category, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { shops, error, retry };
}

export function productsOf(shops: BusinessProfile[]): Product[] {
  return shops.flatMap((shop) => shop.catalog.map((item) => ({ ...item, shop })));
}

export function shopCount(lines: CartLine[]) {
  return new Set(lines.map((line) => line.shopSlug)).size;
}

export function deliveryFee(channel: Channel, lines: CartLine[]) {
  const shops = shopCount(lines);
  return shops ? CHANNELS[channel].feePaise * shops : 0;
}
