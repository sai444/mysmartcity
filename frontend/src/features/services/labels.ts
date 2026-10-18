import type { ServiceListingStatus, ServiceSla } from "../../api/types";
import { servicePrice } from "../city/labels";

type ChipColor = "success" | "warning" | "error" | "default";

export const SERVICE_STATUS: Record<ServiceListingStatus, { label: string; color: ChipColor }> = {
  pending: { label: "Waiting for approval", color: "warning" },
  approved: { label: "Live", color: "success" },
  rejected: { label: "Rejected", color: "error" },
  disabled: { label: "Taken down", color: "default" },
};

export function slaLine(sla: ServiceSla) {
  const parts: string[] = [];
  if (sla.response_hours) parts.push(`Responds in ${sla.response_hours}h`);
  if (sla.completion_hours) parts.push(`Finishes in ${sla.completion_hours}h`);
  if (sla.note) parts.push(sla.note);
  return parts.join(" · ");
}

export function listingPrice(paise: number | null) {
  return servicePrice(paise);
}

export function rupeesToPaise(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : undefined;
}
