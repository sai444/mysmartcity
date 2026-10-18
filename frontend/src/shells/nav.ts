import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import DirectionsBusOutlinedIcon from "@mui/icons-material/DirectionsBusOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import HandymanOutlinedIcon from "@mui/icons-material/HandymanOutlined";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import LocalGroceryStoreOutlinedIcon from "@mui/icons-material/LocalGroceryStoreOutlined";
import LocationCityOutlinedIcon from "@mui/icons-material/LocationCityOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import QrCode2OutlinedIcon from "@mui/icons-material/QrCode2Outlined";
import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import SmartDisplayOutlinedIcon from "@mui/icons-material/SmartDisplayOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import type { SvgIconComponent } from "@mui/icons-material";

export type NavItem = {
  to: string;
  label: string;
  icon: SvgIconComponent;
  feature?: string;
  adminOnly?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type FooterLink = {
  to: string;
  label: string;
  feature?: string;
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "City",
    items: [
      { to: "/city", label: "City", icon: LocationCityOutlinedIcon, feature: "city" },
      { to: "/map", label: "Map", icon: MapOutlinedIcon, feature: "map" },
      { to: "/shop", label: "Shop", icon: QrCode2OutlinedIcon, feature: "shop" },
    ],
  },
  {
    label: "Everyday",
    items: [
      { to: "/grocery", label: "Grocery", icon: LocalGroceryStoreOutlinedIcon, feature: "grocery" },
      { to: "/food", label: "Food", icon: RestaurantOutlinedIcon, feature: "food" },
      { to: "/travel", label: "Travel", icon: DirectionsBusOutlinedIcon, feature: "travel" },
      { to: "/services", label: "Services", icon: HandymanOutlinedIcon, feature: "services" },
      { to: "/market", label: "Market", icon: StorefrontOutlinedIcon, feature: "market" },
      { to: "/property", label: "Property", icon: HomeWorkOutlinedIcon, feature: "property" },
      { to: "/shorts", label: "Shorts", icon: SmartDisplayOutlinedIcon, feature: "shorts" },
    ],
  },
  {
    label: "You",
    items: [
      { to: "/activity", label: "Activity", icon: HistoryOutlinedIcon, feature: "activity" },
      { to: "/account", label: "Account", icon: AccountCircleOutlinedIcon },
      { to: "/admin", label: "Admin console", icon: AdminPanelSettingsOutlinedIcon, adminOnly: true },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "City services",
    links: [
      { to: "/city", label: "City overview", feature: "city" },
      { to: "/city/waste", label: "Waste collection", feature: "waste" },
      { to: "/city/reports/new", label: "Report an issue", feature: "reports" },
      { to: "/city/utilities", label: "Utilities & bills", feature: "utilities" },
      { to: "/city/parking", label: "Parking", feature: "parking" },
      { to: "/city/facilities", label: "Facilities", feature: "facilities" },
    ],
  },
  {
    title: "Everyday",
    links: [
      { to: "/map", label: "City map", feature: "map" },
      { to: "/shop", label: "Local shops", feature: "shop" },
      { to: "/grocery", label: "Grocery", feature: "grocery" },
      { to: "/food", label: "Food", feature: "food" },
      { to: "/travel", label: "Travel", feature: "travel" },
      { to: "/services", label: "Local services", feature: "services" },
      { to: "/market", label: "Market", feature: "market" },
      { to: "/property", label: "Property", feature: "property" },
      { to: "/shorts", label: "Shorts", feature: "shorts" },
    ],
  },
];

export function isNavActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function activeNavItem(pathname: string) {
  return NAV_ITEMS.find((item) => isNavActive(pathname, item.to));
}
