import type { CommerceAction, CommerceChannel, CommerceOrder, CommerceOrderStatus } from "../../api/types";

export const ORDER_FLOW: CommerceOrderStatus[] = ["placed", "accepted", "preparing", "out_for_delivery", "delivered"];

export const ORDER_STATUS: Record<
  CommerceOrderStatus,
  { label: string; food: string; color: "info" | "warning" | "success" | "default" | "error" }
> = {
  placed: { label: "Waiting for shop", food: "Waiting for kitchen", color: "info" },
  accepted: { label: "Accepted by shop", food: "Accepted by kitchen", color: "warning" },
  preparing: { label: "Packing", food: "Preparing", color: "warning" },
  out_for_delivery: { label: "Out for delivery", food: "Out for delivery", color: "info" },
  delivered: { label: "Delivered", food: "Delivered", color: "success" },
  cancelled: { label: "Cancelled", food: "Cancelled", color: "default" },
};

export const ORDER_ACTION: Record<CommerceAction, { label: string; food: string; color?: "success" | "error" | "primary" }> = {
  accept: { label: "Accept order", food: "Accept order", color: "success" },
  prepare: { label: "Start packing", food: "Start preparing" },
  dispatch: { label: "Out for delivery", food: "Out for delivery" },
  deliver: { label: "Mark delivered", food: "Mark delivered", color: "success" },
  cancel: { label: "Cancel order", food: "Cancel order", color: "error" },
};

export function orderLabel(status: CommerceOrderStatus, channel: CommerceChannel) {
  const row = ORDER_STATUS[status];
  return channel === "food" ? row.food : row.label;
}

export function actionLabel(action: CommerceAction, channel: CommerceChannel) {
  const row = ORDER_ACTION[action];
  return channel === "food" ? row.food : row.label;
}

export function isOpenOrder(order: CommerceOrder) {
  return order.status !== "delivered" && order.status !== "cancelled";
}

export function orderSummary(order: CommerceOrder) {
  return order.lines.map((line) => `${line.qty} × ${line.name}`).join(", ");
}
