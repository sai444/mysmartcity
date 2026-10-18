import type { BrokerStatus, OfferStatus, PropertyStatus, PropertyType } from "../../api/types";

type ChipColor = "success" | "warning" | "error" | "info" | "default";

export const PROPERTY_TYPE: Record<PropertyType, string> = {
  flat: "Flat / apartment",
  house: "Independent house",
  plot: "Plot / site",
  commercial: "Shop / office",
  farmland: "Farm land",
};

export const PROPERTY_STATUS: Record<PropertyStatus, { label: string; color: ChipColor }> = {
  pending: { label: "Waiting for approval", color: "warning" },
  approved: { label: "For sale", color: "success" },
  under_offer: { label: "Under offer", color: "info" },
  sold: { label: "Sold", color: "default" },
  rejected: { label: "Rejected", color: "error" },
  disabled: { label: "Taken down", color: "default" },
  withdrawn: { label: "Withdrawn", color: "default" },
};

export const OFFER_STATUS: Record<OfferStatus, { label: string; color: ChipColor }> = {
  pending: { label: "Waiting for seller", color: "warning" },
  accepted: { label: "Accepted", color: "success" },
  declined: { label: "Declined", color: "error" },
  withdrawn: { label: "Withdrawn", color: "default" },
  completed: { label: "Sale completed", color: "success" },
  cancelled: { label: "Deal cancelled", color: "default" },
};

export const BROKER_STATUS: Record<BrokerStatus, { label: string; color: ChipColor }> = {
  pending: { label: "Waiting for verification", color: "warning" },
  approved: { label: "Verified broker", color: "success" },
  rejected: { label: "Rejected", color: "error" },
  revoked: { label: "Verification revoked", color: "default" },
};

export const LISTER_LABEL = { owner: "Owner", broker: "Broker", admin: "City desk" } as const;

const CRORE = 100_00_000;
const LAKH = 1_00_000;

function trim(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function propertyPrice(paise: number) {
  const rupees = paise / 100;
  if (rupees >= CRORE) return `₹${trim(rupees / CRORE)} Cr`;
  if (rupees >= LAKH) return `₹${trim(rupees / LAKH)} L`;
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}

export function rupeesToPaise(text: string) {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}
