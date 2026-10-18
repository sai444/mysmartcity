export const CONDITION_LABEL: Record<string, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  rain: "Rain",
  storm: "Storm",
  heat: "Heat",
};

export const AQI_LABEL: Record<string, string> = {
  good: "Good",
  moderate: "Moderate",
  poor: "Poor",
  severe: "Severe",
};

export const AQI_COLOR: Record<string, string> = {
  good: "success.main",
  moderate: "warning.main",
  poor: "warning.dark",
  severe: "error.main",
};

export const KIND_LABEL: Record<string, string> = {
  clinic: "Clinic",
  park: "Park",
  toilet: "Public toilet",
  ev_charger: "EV charger",
  ward_office: "Ward office",
};

export const PULSE_STATE: Record<string, string> = {
  steady: "Steady",
  watch: "Watch",
  busy: "Busy",
  halted: "Halted",
};

export function aqiCategory(aqi: number) {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 200) return "poor";
  return "severe";
}

export const WASTE_LABEL: Record<string, string> = {
  wet: "Wet waste",
  dry: "Dry waste",
  mixed: "Mixed waste",
};

export const SHOP_CATEGORY: Record<string, string> = {
  grocery: "Grocery",
  restaurant: "Restaurant",
  pharmacy: "Pharmacy",
  services: "Services",
  general: "General store",
};

export const PLACE_KIND: Record<string, string> = {
  facility: "Facility",
  parking: "Parking",
  business: "Shop",
  property: "Property",
};

export const REPORT_STATUS: Record<string, { label: string; color: "info" | "warning" | "success" | "default" }> = {
  submitted: { label: "Submitted", color: "info" },
  in_progress: { label: "In progress", color: "warning" },
  resolved: { label: "Resolved", color: "success" },
  rejected: { label: "Closed", color: "default" },
};

export function rupees(paise: number) {
  const value = paise / 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `₹${text}`;
}

export function servicePrice(paise: number | null) {
  return paise === null ? "Price on request" : rupees(paise);
}

export function minutes(total: number) {
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
