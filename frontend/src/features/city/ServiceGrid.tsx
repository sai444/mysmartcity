import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LocalParkingOutlinedIcon from "@mui/icons-material/LocalParkingOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import HandymanOutlinedIcon from "@mui/icons-material/HandymanOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

import type { CityHome } from "../../api/types";
import { COLORS } from "../../theme/themes";
import { linkSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { useFeatures } from "../admin/FeatureContext";
import { useAuth } from "../auth/AuthContext";
import { BILLS } from "../life/catalog";
import { useLife } from "../life/store";
import { WASTE_LABEL } from "./labels";

export function ServiceGrid({ home }: { home: CityHome }) {
  const { user } = useAuth();
  const { isEnabled } = useFeatures();
  const life = useLife(user?.id ?? null);
  const topNotice = home.notices[0];
  const waste = home.waste_today[0];
  const openBills = user ? BILLS.filter((bill) => !life.paidBillIds.includes(bill.id)).length : null;
  const billStatus = openBills === null ? "Sign in to pay" : openBills === 0 ? "Nothing due" : `${openBills} due`;

  const items = [
    {
      title: "Notices",
      status: topNotice ? topNotice.title : "No active notices",
      to: "/city/notices",
      icon: <CampaignOutlinedIcon />,
      feature: "notices",
    },
    {
      title: "Waste today",
      status: waste ? `${WASTE_LABEL[waste.waste_type] ?? waste.waste_type} · ${waste.window_label}` : "No collection today",
      to: "/city/waste",
      icon: <DeleteOutlineIcon />,
      feature: "waste",
    },
    {
      title: "Report an issue",
      status: "File a civic report",
      to: "/city/reports/new",
      icon: <ReportProblemOutlinedIcon />,
      feature: "reports",
    },
    {
      title: "Pay a bill",
      status: billStatus,
      to: "/city/utilities",
      icon: <ReceiptLongOutlinedIcon />,
      feature: "utilities",
    },
    {
      title: "Parking",
      status: `${home.parking_open_count} ${home.parking_open_count === 1 ? "lot" : "lots"} with free spaces`,
      to: "/city/parking",
      icon: <LocalParkingOutlinedIcon />,
      feature: "parking",
    },
    {
      title: "Facilities",
      status: `${home.facility_count} ${home.facility_count === 1 ? "place" : "places"} in this ward`,
      to: "/city/facilities",
      icon: <PlaceOutlinedIcon />,
      feature: "facilities",
    },
    {
      title: "City map",
      status: "Facilities, parking, and shops",
      to: "/map",
      icon: <MapOutlinedIcon />,
      feature: "map",
    },
    {
      title: "Local services",
      status: "Plumbers, tutors, and home help",
      to: "/services",
      icon: <HandymanOutlinedIcon />,
      feature: "services",
    },
  ].filter((item) => isEnabled(item.feature));

  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
      }}
    >
      {items.map(({ feature: _feature, ...item }) => (
        <ServiceTile key={item.title} {...item} />
      ))}
    </Box>
  );
}

function ServiceTile({
  title,
  status,
  to,
  icon,
}: {
  title: string;
  status: string;
  to: string | null;
  icon: ReactNode;
}) {
  const layout = { minHeight: 48, display: "flex", gap: 1.5, alignItems: "flex-start" };
  const badge = (
    <Box
      aria-hidden
      sx={{
        flex: "0 0 auto",
        width: 40,
        height: 40,
        borderRadius: 2,
        display: "grid",
        placeItems: "center",
        color: "primary.main",
        bgcolor: COLORS.selected,
      }}
    >
      {icon}
    </Box>
  );

  const body = (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
        {status}
      </Typography>
    </Box>
  );

  if (!to) {
    return (
      <Box sx={[surfaceSx, layout]}>
        {badge}
        {body}
      </Box>
    );
  }

  return (
    <Box component={RouterLink} to={to} sx={[linkSurfaceSx, layout]}>
      {badge}
      {body}
    </Box>
  );
}
