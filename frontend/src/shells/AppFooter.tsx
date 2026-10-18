import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { Box, Button, Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

import { useFeatures } from "../features/admin/FeatureContext";
import { useAuth } from "../features/auth/AuthContext";
import { Brand } from "./Brand";
import { FOOTER_COLUMNS, type FooterLink } from "./nav";

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <Box component="nav" aria-label={title} sx={{ minWidth: 0 }}>
      <Typography
        component="h2"
        sx={{
          mb: 1.5,
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "text.secondary",
        }}
      >
        {title}
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {links.map((link) => (
          <li key={link.to}>
            <Link
              component={RouterLink}
              to={link.to}
              underline="hover"
              sx={{ color: "text.primary", fontWeight: 500, fontSize: "0.95rem", "&:hover": { color: "primary.main" } }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </Stack>
    </Box>
  );
}

export function AppFooter({ maxWidth = 1120 }: { maxWidth?: number }) {
  const { user } = useAuth();
  const { isEnabled } = useFeatures();
  const visible = (links: FooterLink[]) => links.filter((link) => !link.feature || isEnabled(link.feature));
  const year = new Date().getFullYear();

  const accountLinks: FooterLink[] = user
    ? [
        { to: "/account", label: "Your account" },
        { to: "/activity", label: "Activity", feature: "activity" },
      ]
    : [
        { to: "/login", label: "Sign in" },
        { to: "/register", label: "Create account", feature: "registration" },
        { to: "/admin/login", label: "City desk sign in" },
      ];

  return (
    <Box
      component="footer"
      sx={{
        mt: { xs: 4, md: 6 },
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ width: `min(${maxWidth}px, 100%)`, mx: "auto", px: { xs: 2, sm: 3 }, pt: { xs: 4, md: 5 }, pb: 3 }}>
        <Box
          sx={{
            display: "grid",
            gap: { xs: 3.5, md: 4 },
            gridTemplateColumns: {
              xs: "1fr 1fr",
              md: "minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, minWidth: 0 }}>
            <Brand />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: 320 }}>
              City services, local shops and everyday errands for your ward — in one place.
            </Typography>
            {isEnabled("reports") && (
              <Button component={RouterLink} to="/city/reports/new" size="small" variant="outlined" sx={{ mt: 2 }}>
                Report an issue
              </Button>
            )}
          </Box>
          {FOOTER_COLUMNS.map((column) => (
            <FooterColumn key={column.title} title={column.title} links={visible(column.links)} />
          ))}
          <FooterColumn title="Account" links={visible(accountLinks)} />
        </Box>

        <Box
          sx={{
            mt: { xs: 4, md: 5 },
            pt: 2.5,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            © {year} MyNagari. All rights reserved.
          </Typography>
          <Button
            size="small"
            color="inherit"
            startIcon={<ArrowUpwardIcon fontSize="small" />}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            sx={{ color: "text.secondary" }}
          >
            Back to top
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
