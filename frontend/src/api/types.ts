export type Ward = {
  id: string;
  name: string;
  code: string;
};

export type ForecastDay = {
  date: string;
  condition: string;
  temperature_max_c: number;
  temperature_min_c: number;
  rain_chance_pct: number | null;
};

export type Climate = {
  temperature_c: number;
  condition: string;
  humidity_pct: number;
  aqi: number;
  aqi_category: string;
  recorded_at: string;
  feels_like_c?: number | null;
  wind_kmh?: number | null;
  rain_chance_pct?: number | null;
  source?: "live" | "desk";
  latitude?: number | null;
  longitude?: number | null;
  forecast?: ForecastDay[];
};

export type Notice = {
  id: string;
  ward_id: string | null;
  title: string;
  body: string;
  severity: string;
  starts_at: string;
  ends_at: string;
};

export type WasteWindow = {
  weekday: number;
  waste_type: string;
  window_label: string;
};

export type CitySystem = {
  key: string;
  label: string;
  state: string;
  detail: string;
};

export type CityHome = {
  ward: Ward;
  systems: CitySystem[];
  climate: Climate | null;
  notices: Notice[];
  waste_today: WasteWindow[];
  parking_open_count: number;
  facility_count: number;
  due_bill_count: number | null;
};

export type ParkingLot = {
  id: string;
  ward_id?: string;
  name: string;
  address_text: string;
  capacity: number;
  spaces_free: number;
  price_paise_per_hour: number;
  is_open: boolean;
  latitude: number;
  longitude: number;
};

export type Facility = {
  id: string;
  ward_id?: string;
  kind: string;
  name: string;
  address_text: string;
  opening_hours: string;
  phone: string | null;
  latitude: number;
  longitude: number;
};

export type MapPlace = {
  id: string;
  kind: string;
  subtype: string;
  name: string;
  address_text: string;
  detail: string;
  latitude: number;
  longitude: number;
  href: string | null;
};

export type CityMap = {
  center: { latitude: number; longitude: number };
  zoom: number;
  places: MapPlace[];
};

export type MediaKind = "image" | "video";

export type MediaItem = { id: string; kind: MediaKind; url: string };

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  price_paise: number;
  is_available: boolean;
  image?: string | null;
  media?: MediaItem[];
};

export type ServiceOffering = {
  id: string;
  name: string;
  description: string;
  price_paise: number | null;
  duration_minutes: number | null;
  is_available: boolean;
};

export type BusinessProfile = {
  id: string;
  slug: string;
  name: string;
  category: string;
  ward_id: string;
  ward_name: string;
  address_text: string;
  phone: string | null;
  opening_hours: string;
  about: string;
  latitude: number;
  longitude: number;
  profile_path: string;
  owned: boolean;
  status: ShopStatus;
  review_note: string | null;
  media?: MediaItem[];
  catalog: CatalogItem[];
  services: ServiceOffering[];
};

export type ShopStatus = "pending" | "approved" | "rejected" | "disabled";

export type Feature = {
  key: string;
  group: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type AdminUserRow = {
  id: string;
  email: string;
  display_name: string;
  ward_id: string | null;
  role: "admin" | "resident";
  status: "active" | "disabled";
  created_at: string;
};

export type AuditEntry = {
  actor_name: string;
  action: string;
  target: string;
  created_at: string;
};

export type CitySection = "pulse" | "climate" | "waste";

export type WardControls = {
  ward: Ward;
  systems: CitySystem[];
  climate: Climate | null;
  waste: { waste_type: "wet" | "dry" | "mixed" | "none"; window_label: string };
  parking: ParkingLot[];
  customized: CitySection[];
};

export type AdminOverview = {
  users_total: number;
  users_disabled: number;
  admins: number;
  shops: Record<ShopStatus, number>;
  properties: Record<PropertyStatus, number>;
  brokers_pending: number;
  features_on: number;
  features_total: number;
  reports_open: number;
  notices_active: number;
  orders_open: number;
  services_pending: number;
};

export type CommerceChannel = "grocery" | "food";
export type CommerceOrderStatus = "placed" | "accepted" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";
export type CommercePayment = "upi" | "cod";
export type CommerceAction = "accept" | "prepare" | "dispatch" | "deliver" | "cancel";

export type CommerceOrderLine = {
  item_id: string;
  name: string;
  qty: number;
  unit_price_paise: number;
  line_total_paise: number;
};

export type CommerceOrderEvent = {
  status: CommerceOrderStatus;
  note: string | null;
  actor_name: string;
  created_at: string;
};

export type CommerceOrder = {
  id: string;
  channel: CommerceChannel;
  shop_id: string;
  shop_slug: string;
  shop_name: string;
  buyer_id: string;
  buyer_name: string;
  status: CommerceOrderStatus;
  address: string;
  note: string;
  payment: CommercePayment;
  subtotal_paise: number;
  fee_paise: number;
  total_paise: number;
  lines: CommerceOrderLine[];
  events: CommerceOrderEvent[];
  can_cancel: boolean;
  next_actions: CommerceAction[];
  placed_at: string;
  updated_at: string;
};

export type ReportStatus = "submitted" | "in_progress" | "resolved" | "rejected";

export type CivicReport = {
  id: string;
  user_name: string;
  ward_id: string | null;
  ward_name: string | null;
  category: string;
  place: string;
  details: string;
  media?: MediaItem[];
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type VehicleKind = "bus" | "metro" | "auto" | "taxi" | "boat";

export type ChargeKind = "all" | VehicleKind;
export type ChargeType = "fixed" | "per_km" | "percent";

export type TripPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

export type FareRule = {
  kind: VehicleKind;
  base_paise: number;
  included_km: number;
  per_km_paise: number;
  per_minute_paise: number;
  min_paise: number;
  night_surcharge_pct: number;
  night_start: string;
  night_end: string;
  per_seat: boolean;
  speed_kmh: number;
};

export type FareCharge = {
  id: string;
  kind: ChargeKind;
  name: string;
  amount: number;
  charge_type: ChargeType;
  is_active: boolean;
};

export type FareBook = {
  rules: FareRule[];
  charges: FareCharge[];
};

export type FareLine = {
  label: string;
  amount_paise: number;
};

export type KindQuote = {
  kind: VehicleKind;
  fare_paise: number;
  minutes: number;
  per_seat: boolean;
  night: boolean;
  breakdown: FareLine[];
  vehicles: Vehicle[];
};

export type TravelQuote = {
  distance_km: number;
  origin: TripPoint;
  destination: TripPoint;
  seats: number;
  quotes: KindQuote[];
};

export type PlaceHint = {
  label: string;
  latitude: number;
  longitude: number;
};

export type MapsConfig = {
  provider: "google" | "osm";
  browser_key: string | null;
};

export type Vehicle = {
  id: string;
  name: string;
  kind: VehicleKind | string;
  registration: string;
  origin: string;
  destination: string;
  price_paise: number;
  seats: number;
  phone: string;
  contact_name: string;
  minutes: number;
  departures: string;
  notes: string;
  is_active: boolean;
  media?: MediaItem[];
};

export type Page<T> = {
  data: T[];
  meta: { limit: number; offset: number; total: number };
};

export type UserProfile = {
  id: string;
  email: string;
  display_name: string;
  ward_id: string | null;
  ui_mode: "modern" | "normal";
  role: "admin" | "resident";
  map_style: MapStyle;
  avatar_url: string | null;
  default_address: string | null;
};

export type MapStyle = "auto" | "street" | "voyager" | "light" | "dark" | "satellite" | "terrain";

export type AdminWard = Ward & {
  latitude: number;
  longitude: number;
  active: boolean;
  facility_count: number;
  parking_count: number;
};

export type PropertyType = "flat" | "house" | "plot" | "commercial" | "farmland";
export type PropertyStatus = "pending" | "approved" | "under_offer" | "sold" | "rejected" | "disabled" | "withdrawn";
export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn" | "completed" | "cancelled";
export type BrokerStatus = "pending" | "approved" | "rejected" | "revoked";

export type Property = {
  id: string;
  title: string;
  property_type: PropertyType;
  ward_id: string;
  ward_name: string;
  address_text: string;
  area_sqft: number;
  bedrooms: number | null;
  price_paise: number;
  description: string;
  image: string | null;
  media?: MediaItem[];
  lister_role: "owner" | "broker" | "admin";
  lister_name: string;
  agency_name: string | null;
  owner_name: string | null;
  commission_pct: number | null;
  latitude: number;
  longitude: number;
  status: PropertyStatus;
  review_note: string | null;
  sold_price_paise: number | null;
  offer_count: number;
  created_at: string;
  mine: boolean;
  contact_phone: string | null;
};

export type PropertyOffer = {
  id: string;
  property_id: string;
  buyer_name: string;
  buyer_phone: string | null;
  amount_paise: number;
  message: string;
  status: OfferStatus;
  seller_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagedProperty = Property & { offers: PropertyOffer[] };

export type BuyerOffer = PropertyOffer & { property: Property; seller_phone: string | null };

export type ServiceListingStatus = "pending" | "approved" | "rejected" | "disabled";

export type ServiceSla = {
  response_hours: number | null;
  completion_hours: number | null;
  note: string;
};

export type ServiceCategory = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  subcategory_count: number;
};

export type ServiceSubcategory = {
  id: string;
  category_id: string;
  category_name: string;
  name: string;
  response_hours: number | null;
  completion_hours: number | null;
  sla_note: string;
  sla: ServiceSla;
  sort_order: number;
  active: boolean;
};

export type ServiceCatalogCategory = {
  id: string;
  name: string;
  subcategories: ServiceSubcategory[];
};

export type LocalService = {
  id: string;
  title: string;
  details: string;
  category_id: string;
  category_name: string;
  subcategory_id: string;
  subcategory_name: string;
  price_paise: number | null;
  ward_id: string;
  ward_name: string;
  area_text: string;
  contact_name: string;
  contact_phone: string | null;
  provider_name: string;
  sla: ServiceSla;
  status: ServiceListingStatus;
  review_note: string | null;
  mine: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceWrite = {
  title: string;
  details: string;
  subcategory_id: string;
  price_paise: number | null;
  ward_id: string;
  area_text: string;
  contact_name: string;
  contact_phone: string;
};

export type Broker = {
  user_id: string;
  display_name: string;
  agency_name: string;
  license_no: string;
  phone: string;
  about: string;
  status: BrokerStatus;
  review_note: string | null;
  created_at: string;
};
