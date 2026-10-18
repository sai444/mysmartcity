import type { ShopStatus } from "../../api/types";

export const STATUS_CHIP: Record<ShopStatus, { label: string; color: "success" | "warning" | "error" | "default" }> = {
  approved: { label: "Live", color: "success" },
  pending: { label: "Waiting for approval", color: "warning" },
  rejected: { label: "Rejected", color: "error" },
  disabled: { label: "Disabled", color: "default" },
};
