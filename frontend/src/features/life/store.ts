import { useSyncExternalStore } from "react";

export type Channel = "grocery" | "food";

export type CartLine = {
  itemId: string;
  shopSlug: string;
  shopName: string;
  name: string;
  pricePaise: number;
  qty: number;
  channel: Channel;
  image?: string | null;
};

export type ActivityKind = "report" | "bill" | "parking" | "grocery" | "food" | "travel" | "market";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  status: string;
  amountPaise?: number;
  at: string;
  orderId?: string;
};

export type PaymentMethod = "upi" | "cod";

export type OrderStatus = "placed" | "accepted" | "packing" | "out_for_delivery" | "delivered" | "cancelled";

export type Order = {
  id: string;
  channel: Channel;
  lines: CartLine[];
  address: string;
  note: string;
  payment: PaymentMethod;
  subtotalPaise: number;
  feePaise: number;
  totalPaise: number;
  placedAt: string;
  cancelledAt?: string;
};

export type LifeState = {
  cart: CartLine[];
  activity: ActivityEntry[];
  orders: Order[];
  paidBillIds: string[];
};

const empty = (): LifeState => ({ cart: [], activity: [], orders: [], paidBillIds: [] });

const buckets = new Map<string, LifeState>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(userId: string) {
  return `mynagari.life.${userId}`;
}

function read(userId: string): LifeState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<LifeState>;
    return {
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      paidBillIds: Array.isArray(parsed.paidBillIds) ? parsed.paidBillIds : [],
    };
  } catch {
    return empty();
  }
}

function bucket(userId: string) {
  const id = userId || "guest";
  if (!buckets.has(id)) buckets.set(id, read(id));
  return buckets.get(id)!;
}

function commit(userId: string, next: LifeState) {
  const id = userId || "guest";
  buckets.set(id, next);
  localStorage.setItem(storageKey(id), JSON.stringify(next));
  listeners.get(id)?.forEach((listener) => listener());
}

function subscribe(userId: string, listener: () => void) {
  const id = userId || "guest";
  const set = listeners.get(id) ?? new Set();
  set.add(listener);
  listeners.set(id, set);
  return () => set.delete(listener);
}

export function useLife(userId: string | null) {
  const id = userId || "guest";
  return useSyncExternalStore(
    (listener) => subscribe(id, listener),
    () => bucket(id),
  );
}

function entry(partial: Omit<ActivityEntry, "id" | "at">): ActivityEntry {
  return { ...partial, id: crypto.randomUUID(), at: new Date().toISOString() };
}

export function addToCart(userId: string, line: Omit<CartLine, "qty">) {
  const current = bucket(userId);
  const existing = current.cart.find((item) => item.itemId === line.itemId && item.channel === line.channel);
  const cart = existing
    ? current.cart.map((item) => (item === existing ? { ...item, qty: item.qty + 1 } : item))
    : [...current.cart, { ...line, qty: 1 }];
  commit(userId, { ...current, cart });
}

export function setCartQty(userId: string, itemId: string, channel: Channel, qty: number) {
  const current = bucket(userId);
  const cart = current.cart
    .map((item) => (item.itemId === itemId && item.channel === channel ? { ...item, qty } : item))
    .filter((item) => item.qty > 0);
  commit(userId, { ...current, cart });
}

export function replaceCart(userId: string, line: Omit<CartLine, "qty">) {
  const current = bucket(userId);
  const cart = [...current.cart.filter((item) => item.channel !== line.channel), { ...line, qty: 1 }];
  commit(userId, { ...current, cart });
}

export function removeFromCart(userId: string, itemId: string, channel: Channel) {
  setCartQty(userId, itemId, channel, 0);
}

export function clearChannelCart(userId: string, channel: Channel) {
  const current = bucket(userId);
  commit(userId, { ...current, cart: current.cart.filter((item) => item.channel !== channel) });
}

export function placeOrder(
  userId: string,
  channel: Channel,
  details: { address: string; note?: string; payment?: PaymentMethod; feePaise?: number },
): Order | null {
  const current = bucket(userId);
  const lines = current.cart.filter((item) => item.channel === channel);
  const address = details.address.trim();
  if (!lines.length || !address) return null;
  const subtotalPaise = cartTotal(lines);
  const feePaise = details.feePaise ?? 0;
  const order: Order = {
    id: crypto.randomUUID(),
    channel,
    lines,
    address,
    note: details.note?.trim() ?? "",
    payment: details.payment ?? "upi",
    subtotalPaise,
    feePaise,
    totalPaise: subtotalPaise + feePaise,
    placedAt: new Date().toISOString(),
  };
  const shops = [...new Set(lines.map((item) => item.shopName))].join(", ");
  const summary = lines.map((item) => `${item.qty} × ${item.name}`).join(", ");
  const activity: ActivityEntry = {
    id: order.id,
    kind: channel,
    title: channel === "grocery" ? `Grocery · ${shops}` : `Food · ${shops}`,
    detail: `${summary}. Deliver to ${address}.`,
    status: ORDER_STATUS_LABEL.placed,
    amountPaise: order.totalPaise,
    at: order.placedAt,
    orderId: order.id,
  };
  commit(userId, {
    ...current,
    cart: current.cart.filter((item) => item.channel !== channel),
    orders: [order, ...current.orders],
    activity: [activity, ...current.activity],
  });
  return order;
}

export function cancelOrder(userId: string, orderId: string) {
  const current = bucket(userId);
  const order = current.orders.find((item) => item.id === orderId);
  if (!order || !canCancel(order)) return false;
  commit(userId, {
    ...current,
    orders: current.orders.map((item) => (item.id === orderId ? { ...item, cancelledAt: new Date().toISOString() } : item)),
  });
  return true;
}

export function reorder(userId: string, order: Order) {
  const current = bucket(userId);
  const cart = order.channel === "food" ? current.cart.filter((item) => item.channel !== "food") : [...current.cart];
  for (const line of order.lines) {
    const index = cart.findIndex((item) => item.itemId === line.itemId && item.channel === line.channel);
    if (index >= 0) cart[index] = { ...cart[index], qty: cart[index].qty + line.qty };
    else cart.push({ ...line });
  }
  commit(userId, { ...current, cart });
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted by shop",
  packing: "Packing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// No operator service moves orders yet, so progress is derived from minutes since placement.
const ORDER_STEPS: { status: Exclude<OrderStatus, "cancelled">; afterMinutes: number }[] = [
  { status: "placed", afterMinutes: 0 },
  { status: "accepted", afterMinutes: 1 },
  { status: "packing", afterMinutes: 3 },
  { status: "out_for_delivery", afterMinutes: 10 },
  { status: "delivered", afterMinutes: 25 },
];

const FOOD_STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: "Accepted by kitchen",
  packing: "Preparing",
};

export type OrderStep = { status: OrderStatus; label: string; at: string; reached: boolean };

export function orderTimeline(order: Order, now = Date.now()): OrderStep[] {
  const placed = new Date(order.placedAt).getTime();
  const stopAt = order.cancelledAt ? new Date(order.cancelledAt).getTime() : now;
  const steps: OrderStep[] = ORDER_STEPS.map((step) => {
    const at = placed + step.afterMinutes * 60_000;
    const label = order.channel === "food" ? (FOOD_STEP_LABEL[step.status] ?? ORDER_STATUS_LABEL[step.status]) : ORDER_STATUS_LABEL[step.status];
    return { status: step.status, label, at: new Date(at).toISOString(), reached: at <= stopAt };
  });
  if (!order.cancelledAt) return steps;
  return [
    ...steps.filter((step) => step.reached),
    { status: "cancelled", label: ORDER_STATUS_LABEL.cancelled, at: order.cancelledAt, reached: true },
  ];
}

export function orderStatus(order: Order, now = Date.now()): OrderStep {
  return orderTimeline(order, now).filter((step) => step.reached).at(-1)!;
}

export function canCancel(order: Order, now = Date.now()) {
  const status = orderStatus(order, now).status;
  return status === "placed" || status === "accepted";
}

export function payBill(userId: string, billId: string, title: string, amountPaise: number) {
  const current = bucket(userId);
  if (current.paidBillIds.includes(billId)) return;
  commit(userId, {
    ...current,
    paidBillIds: [...current.paidBillIds, billId],
    activity: [
      entry({ kind: "bill", title, detail: "Payment captured for this billing period.", status: "Paid", amountPaise }),
      ...current.activity,
    ],
  });
}

export function reserveParking(userId: string, lotName: string, hours: number, amountPaise: number) {
  const current = bucket(userId);
  commit(userId, {
    ...current,
    activity: [
      entry({
        kind: "parking",
        title: lotName,
        detail: `${hours} ${hours === 1 ? "hour" : "hours"} reserved.`,
        status: "Reserved",
        amountPaise,
      }),
      ...current.activity,
    ],
  });
}

export function bookTravel(userId: string, title: string, detail: string, amountPaise: number) {
  const current = bucket(userId);
  commit(userId, {
    ...current,
    activity: [entry({ kind: "travel", title, detail, status: "Booked", amountPaise }), ...current.activity],
  });
}

export function logMarketOrder(
  userId: string,
  order: { title: string; seller_name: string; quantity: number; total_paise: number },
) {
  const current = bucket(userId);
  const count = order.quantity > 1 ? ` ${order.quantity}` : "";
  commit(userId, {
    ...current,
    activity: [
      entry({
        kind: "market",
        title: order.title,
        detail: `Requested${count} from ${order.seller_name}. Track it in My market.`,
        status: "Requested",
        amountPaise: order.total_paise,
      }),
      ...current.activity,
    ],
  });
}

export function cartCount(cart: CartLine[], channel?: Channel) {
  return cart.filter((item) => !channel || item.channel === channel).reduce((sum, item) => sum + item.qty, 0);
}

export function cartTotal(cart: CartLine[], channel?: Channel) {
  return cart
    .filter((item) => !channel || item.channel === channel)
    .reduce((sum, item) => sum + item.pricePaise * item.qty, 0);
}
