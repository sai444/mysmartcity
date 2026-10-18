export type DemoAccount = {
  role: "admin" | "resident";
  name: string;
  email: string;
  password: string;
  ward: string;
  blurb: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "admin",
    name: "Meera Iyer",
    email: "admin@example.com",
    password: "nagari-admin",
    ward: "Gandhi Nagar",
    blurb: "Publishes notices, bills, and report status.",
  },
  {
    role: "resident",
    name: "Asha Rao",
    email: "asha@example.com",
    password: "nagari-home",
    ward: "Lake View",
    blurb: "Pays a water bill, files a report, and shops nearby.",
  },
];

export const CITY_SNAPSHOT = [
  { label: "Gandhi Nagar", value: "31.5°C · Clear" },
  { label: "Lake View", value: "27°C · Rain" },
  { label: "Market Ward", value: "34°C · Heat" },
];

export type DeskRow = { title: string; meta: string };

export const ADMIN_DESK = {
  stats: [
    { label: "Open reports", value: "6" },
    { label: "Live notices", value: "3" },
    { label: "Bills posted", value: "12" },
  ],
  rows: [
    { title: "Pothole on MG Road", meta: "Submitted · Gandhi Nagar" },
    { title: "Streetlight out, Lake road", meta: "Acknowledged · Lake View" },
    { title: "Heat advisory until 6 PM", meta: "Warning · All wards" },
    { title: "Water bill · ••••1842", meta: "Due ₹640 · Asha Rao" },
  ] satisfies DeskRow[],
};

export const RESIDENT_DESK = {
  stats: [
    { label: "Due bills", value: "₹640" },
    { label: "Open reports", value: "1" },
    { label: "Waste today", value: "07:00" },
  ],
  rows: [
    { title: "Water bill · October", meta: "Due ₹640 · pay from Utilities" },
    { title: "Streetlight out, Lake road", meta: "Acknowledged · filed yesterday" },
    { title: "Lake View lot", meta: "Reserved tomorrow · 18:00–19:00" },
    { title: "Grocery order", meta: "Delivered · ₹486" },
  ] satisfies DeskRow[],
};
