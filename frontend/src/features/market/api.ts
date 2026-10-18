import { apiGet, apiRequest } from "../../api/client";
import type { MediaItem } from "../../api/types";

export type MarketCategory = "furniture" | "electronics" | "home" | "books" | "clothing" | "kids" | "sports" | "homemade" | "other";
export type MarketCondition = "new" | "like_new" | "good" | "fair";
export type ListingStatus = "active" | "paused" | "sold_out";
export type MarketOrderStatus = "placed" | "accepted" | "completed" | "declined" | "cancelled";
export type OrderAction = "accept" | "decline" | "cancel" | "complete";
export type MarketSort = "newest" | "price_low" | "price_high" | "rating";

export type ListingSummary = {
  id: string;
  title: string;
  category: MarketCategory;
  condition: MarketCondition;
  price_paise: number;
  quantity: number;
  status: ListingStatus;
  ward_id: string | null;
  ward_name: string;
  seller_id: string;
  seller_name: string;
  cover_url: string | null;
  rating_avg: number | null;
  review_count: number;
  open_orders: number;
  created_at: string;
};

export type MarketReview = {
  id: string;
  reviewer_id: string;
  reviewer_name: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type ListingDetail = ListingSummary & {
  description: string;
  pickup_area: string;
  photos: { id: string; url: string }[];
  media: MediaItem[];
  updated_at: string;
  reviews: MarketReview[];
  seller: {
    id: string;
    name: string;
    rating_avg: number | null;
    review_count: number;
    active_listings: number;
    completed_sales: number;
  };
  viewer: {
    is_seller: boolean;
    can_review: boolean;
    open_order_id: string | null;
    my_review: MarketReview | null;
  };
};

export type MarketOrder = {
  id: string;
  listing_id: string;
  title: string;
  cover_url: string | null;
  price_paise: number;
  quantity: number;
  total_paise: number;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  seller_name: string;
  note: string;
  seller_note: string;
  status: MarketOrderStatus;
  reviewed: boolean;
  created_at: string;
  updated_at: string;
};

export type ListingInput = {
  title: string;
  description: string;
  category: MarketCategory;
  condition: MarketCondition;
  price_paise: number;
  quantity: number;
  pickup_area: string;
  photos: string[];
  media: string[];
};

export const CATEGORY_LABEL: Record<MarketCategory, string> = {
  furniture: "Furniture",
  electronics: "Electronics",
  home: "Home & kitchen",
  books: "Books",
  clothing: "Clothing",
  kids: "Kids",
  sports: "Sports",
  homemade: "Homemade",
  other: "Other",
};

export const CONDITION_LABEL: Record<MarketCondition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
};

export const LISTING_STATUS: Record<ListingStatus, { label: string; color: "success" | "default" | "warning" }> = {
  active: { label: "Live", color: "success" },
  paused: { label: "Paused", color: "default" },
  sold_out: { label: "Sold out", color: "warning" },
};

export const ORDER_STATUS: Record<MarketOrderStatus, { label: string; color: "info" | "warning" | "success" | "default" }> = {
  placed: { label: "Waiting for seller", color: "info" },
  accepted: { label: "Accepted · arrange pickup", color: "warning" },
  completed: { label: "Completed", color: "success" },
  declined: { label: "Declined", color: "default" },
  cancelled: { label: "Cancelled", color: "default" },
};

export function assetUrl(path: string | null) {
  if (!path) return null;
  return `${import.meta.env.VITE_API_URL ?? ""}${path}`;
}

export function browseListings(params: { q?: string; category?: string; sort?: MarketSort; includeSold?: boolean }) {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.category) search.set("category", params.category);
  if (params.sort) search.set("sort", params.sort);
  if (params.includeSold) search.set("include_sold", "true");
  return apiGet<{ data: ListingSummary[] }>(`/api/v1/market/listings?${search}`).then((body) => body.data);
}

export function myListings() {
  return apiGet<{ data: ListingSummary[] }>("/api/v1/market/listings/mine").then((body) => body.data);
}

export function getListing(id: string) {
  return apiGet<ListingDetail>(`/api/v1/market/listings/${encodeURIComponent(id)}`);
}

export function createListing(body: ListingInput) {
  return apiRequest<ListingDetail>("/api/v1/market/listings", { method: "POST", body });
}

export function updateListing(id: string, body: Partial<ListingInput> & { status?: "active" | "paused" }) {
  return apiRequest<ListingDetail>(`/api/v1/market/listings/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function removeListing(id: string) {
  return apiRequest<void>(`/api/v1/market/listings/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function placeOrder(id: string, quantity: number, note: string) {
  return apiRequest<MarketOrder>(`/api/v1/market/listings/${encodeURIComponent(id)}/orders`, {
    method: "POST",
    body: { quantity, note },
  });
}

export function myOrders() {
  return apiGet<{ buying: MarketOrder[]; selling: MarketOrder[] }>("/api/v1/market/orders");
}

export function actOnOrder(id: string, action: OrderAction, note = "") {
  return apiRequest<MarketOrder>(`/api/v1/market/orders/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: { action, note },
  });
}

export function writeReview(id: string, rating: number, comment: string) {
  return apiRequest<ListingDetail>(`/api/v1/market/listings/${encodeURIComponent(id)}/review`, {
    method: "PUT",
    body: { rating, comment },
  });
}

export function deleteReview(id: string) {
  return apiRequest<void>(`/api/v1/market/listings/${encodeURIComponent(id)}/review`, { method: "DELETE" });
}
