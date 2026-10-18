import { apiGet, apiRequest } from "../../api/client";
import type { CommerceAction, CommerceChannel, CommerceOrder, CommerceOrderStatus } from "../../api/types";

export function placeCommerceOrder(body: {
  channel: CommerceChannel;
  address: string;
  note?: string;
  payment: "upi" | "cod";
  idempotency_key?: string;
  lines: { item_id: string; shop_slug: string; qty: number }[];
}) {
  return apiRequest<{ data: CommerceOrder[] }>("/api/v1/orders", { method: "POST", body });
}

export function myCommerceOrders() {
  return apiGet<{ data: CommerceOrder[] }>("/api/v1/orders");
}

export function incomingCommerceOrders() {
  return apiGet<{ data: CommerceOrder[] }>("/api/v1/orders/incoming");
}

export function getCommerceOrder(id: string) {
  return apiGet<CommerceOrder>(`/api/v1/orders/${encodeURIComponent(id)}`);
}

export function cancelCommerceOrder(id: string) {
  return apiRequest<CommerceOrder>(`/api/v1/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export function actOnCommerceOrder(id: string, action: CommerceAction, note?: string, admin = false) {
  const path = admin
    ? `/api/v1/admin/orders/${encodeURIComponent(id)}/status`
    : `/api/v1/orders/${encodeURIComponent(id)}/status`;
  return apiRequest<CommerceOrder>(path, { method: "POST", body: { action, note: note || null } });
}

export function adminCommerceOrders(status?: CommerceOrderStatus | "open" | "all", channel?: CommerceChannel | "all") {
  const params = new URLSearchParams();
  if (status && status !== "open" && status !== "all") params.set("status", status);
  if (channel && channel !== "all") params.set("channel", channel);
  const query = params.toString();
  return apiGet<{ data: CommerceOrder[] }>(`/api/v1/admin/orders${query ? `?${query}` : ""}`);
}
