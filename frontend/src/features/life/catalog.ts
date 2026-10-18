export const REPORT_CATEGORIES = [
  { id: "pothole", label: "Pothole" },
  { id: "streetlight", label: "Streetlight" },
  { id: "water", label: "Water leak" },
  { id: "garbage", label: "Garbage" },
  { id: "drainage", label: "Drainage" },
  { id: "pickup", label: "Missed pickup" },
] as const;

export const BILLS = [
  { id: "water-oct", utility: "Water", period: "October", consumer: "••••1842", amountPaise: 64000, due: "20 Oct" },
  { id: "power-oct", utility: "Electricity", period: "October", consumer: "••••9021", amountPaise: 128000, due: "24 Oct" },
];

export const TRAVEL_ROUTES = [
  {
    id: "gn-lv-bus",
    from: "Gandhi Nagar",
    to: "Lake View",
    mode: "City bus",
    minutes: 28,
    pricePaise: 2500,
    seats: 18,
    departures: ["07:40", "09:10", "18:20"],
  },
  {
    id: "gn-mw-metro",
    from: "Gandhi Nagar",
    to: "Market Ward",
    mode: "Metro",
    minutes: 16,
    pricePaise: 3000,
    seats: 40,
    departures: ["08:05", "08:20", "17:45"],
  },
  {
    id: "lv-mw-bus",
    from: "Lake View",
    to: "Market Ward",
    mode: "City bus",
    minutes: 34,
    pricePaise: 3500,
    seats: 12,
    departures: ["08:30", "12:15", "19:00"],
  },
  {
    id: "mw-gn-bus",
    from: "Market Ward",
    to: "Gandhi Nagar",
    mode: "City bus",
    minutes: 22,
    pricePaise: 2500,
    seats: 22,
    departures: ["07:15", "16:40", "20:10"],
  },
];

export const WASTE_NOTES: Record<string, string> = {
  wet: "Food scraps and garden waste. Keep the bag closed so it does not leak at the gate.",
  dry: "Paper, plastic, and metal. Rinse containers before you set them out.",
  mixed: "One bag is enough today. Tie it and leave it at the gate before the window opens.",
};
