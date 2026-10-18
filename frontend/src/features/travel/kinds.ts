import type { VehicleKind } from "../../api/types";

export const VEHICLE_KINDS: { id: VehicleKind; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "taxi", label: "Taxi" },
  { id: "bus", label: "City bus" },
  { id: "metro", label: "Metro" },
  { id: "boat", label: "Boat" },
];

export function kindLabel(kind: string) {
  return VEHICLE_KINDS.find((item) => item.id === kind)?.label ?? kind;
}
