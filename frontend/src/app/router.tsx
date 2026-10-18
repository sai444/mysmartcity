import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Link as RouterLink, Navigate } from "react-router-dom";

import { FeatureGate } from "../features/admin/FeatureGate";
import AccountPage from "../features/auth/AccountPage";
import LoginPage, { AdminLoginPage } from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import { AppShell } from "../shells/AppShell";
import ReportsPage from "../features/city/ReportsPage";
import UtilitiesPage from "../features/city/UtilitiesPage";

const CityMapPage = lazy(() => import("../features/map/CityMapPage"));
const ShopPage = lazy(() => import("../features/shop/ShopPage"));
const ShopProfilePage = lazy(() => import("../features/shop/ShopProfilePage"));
const AdminPage = lazy(() => import("../features/admin/AdminPage"));

const CityHomePage = lazy(() => import("../features/city/CityHomePage"));
const WastePage = lazy(() => import("../features/city/CityPages"));
const FacilitiesPage = lazy(() => import("../features/city/CityPages").then((m) => ({ default: m.FacilitiesPage })));
const NoticesPage = lazy(() => import("../features/city/CityPages").then((m) => ({ default: m.NoticesPage })));
const NoticeDetailPage = lazy(() => import("../features/city/CityPages").then((m) => ({ default: m.NoticeDetailPage })));
const ParkingPage = lazy(() => import("../features/city/CityPages").then((m) => ({ default: m.ParkingPage })));
const GroceryPage = lazy(() => import("../features/grocery/GroceryPages").then((m) => ({ default: m.GroceryBrowsePage })));
const GroceryProductPage = lazy(() => import("../features/grocery/GroceryPages").then((m) => ({ default: m.GroceryProductPage })));
const FoodPage = lazy(() => import("../features/food/FoodPages").then((m) => ({ default: m.FoodBrowsePage })));
const RestaurantPage = lazy(() => import("../features/food/FoodPages").then((m) => ({ default: m.RestaurantPage })));
const CartPage = lazy(() => import("../features/commerce/CheckoutPages").then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import("../features/commerce/CheckoutPages").then((m) => ({ default: m.CheckoutPage })));
const OrderPage = lazy(() => import("../features/orders/OrderPage"));
const TravelPage = lazy(() => import("../features/travel/TravelPage"));
const MarketPage = lazy(() => import("../features/market/MarketPage"));
const MarketListingPage = lazy(() => import("../features/market/ListingPage"));
const MarketSellPage = lazy(() => import("../features/market/SellPage"));
const MyMarketPage = lazy(() => import("../features/market/MyMarketPage"));
const PropertyPage = lazy(() => import("../features/property/PropertyPage"));
const ServicesPage = lazy(() => import("../features/services/ServicesPage"));
const ActivityPage = lazy(() => import("../features/activity/ActivityPage"));
const ShortsPage = lazy(() => import("../features/shorts/ShortsPage"));
const ShortsStudioPage = lazy(() => import("../features/shorts/StudioPage"));

function Pending() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress aria-label="Loading page" />
    </Box>
  );
}

function NotFound() {
  return (
    <Stack spacing={1.5} sx={{ alignItems: "flex-start", py: 4 }}>
      <Typography variant="h1">Page not found</Typography>
      <Typography color="text.secondary">That link does not lead anywhere in MyNagari.</Typography>
      <Button component={RouterLink} to="/city" variant="contained">
        Back to city home
      </Button>
    </Stack>
  );
}

function gated(feature: string, page: ReactNode) {
  return (
    <FeatureGate feature={feature}>
      <Suspense fallback={<Pending />}>{page}</Suspense>
    </FeatureGate>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/admin/login", element: <AdminLoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/city" replace /> },
      { path: "city", element: gated("city", <CityHomePage />) },
      { path: "city/waste", element: gated("waste", <WastePage />) },
      { path: "city/notices", element: gated("notices", <NoticesPage />) },
      { path: "city/notices/:noticeId", element: gated("notices", <NoticeDetailPage />) },
      { path: "city/reports/new", element: gated("reports", <ReportsPage />) },
      { path: "city/utilities", element: gated("utilities", <UtilitiesPage />) },
      { path: "city/parking", element: gated("parking", <ParkingPage />) },
      { path: "city/facilities", element: gated("facilities", <FacilitiesPage />) },
      { path: "map", element: gated("map", <CityMapPage />) },
      { path: "shop/*", element: gated("shop", <ShopPage />) },
      { path: "b/:slug", element: gated("shop", <ShopProfilePage />) },
      { path: "grocery", element: gated("grocery", <GroceryPage />) },
      { path: "grocery/cart", element: gated("grocery", <CartPage channel="grocery" />) },
      { path: "grocery/checkout", element: gated("grocery", <CheckoutPage channel="grocery" />) },
      { path: "grocery/:itemId", element: gated("grocery", <GroceryProductPage />) },
      {
        path: "orders/:orderId",
        element: (
          <Suspense fallback={<Pending />}>
            <OrderPage />
          </Suspense>
        ),
      },
      { path: "food", element: gated("food", <FoodPage />) },
      { path: "food/cart", element: gated("food", <CartPage channel="food" />) },
      { path: "food/checkout", element: gated("food", <CheckoutPage channel="food" />) },
      { path: "food/:slug", element: gated("food", <RestaurantPage />) },
      { path: "travel", element: gated("travel", <TravelPage />) },
      { path: "services/*", element: gated("services", <ServicesPage />) },
      { path: "market", element: gated("market", <MarketPage />) },
      { path: "market/sell", element: gated("market", <MarketSellPage />) },
      { path: "market/mine", element: gated("market", <MyMarketPage />) },
      { path: "market/:listingId", element: gated("market", <MarketListingPage />) },
      { path: "market/:listingId/edit", element: gated("market", <MarketSellPage />) },
      { path: "property/*", element: gated("property", <PropertyPage />) },
      { path: "shorts", element: gated("shorts", <ShortsPage />) },
      { path: "shorts/studio", element: gated("shorts", <ShortsStudioPage />) },
      { path: "activity", element: gated("activity", <ActivityPage />) },
      { path: "account", element: <AccountPage /> },
      {
        path: "admin",
        element: (
          <Suspense fallback={<Pending />}>
            <AdminPage />
          </Suspense>
        ),
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
