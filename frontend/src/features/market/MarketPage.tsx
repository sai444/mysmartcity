import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { errorMessage } from "../../api/client";
import { PageIntro } from "../life/ui";
import { browseListings, CATEGORY_LABEL, type ListingSummary, type MarketCategory, type MarketSort } from "./api";
import { ListingCard, Loading, MarketTabs } from "./parts";

const SORTS: { value: MarketSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "rating", label: "Best rated" },
];

export default function MarketPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<MarketCategory | "">("");
  const [sort, setSort] = useState<MarketSort>("newest");
  const [includeSold, setIncludeSold] = useState(false);
  const [listings, setListings] = useState<ListingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setError(null);
    browseListings({ q: debounced, category, sort, includeSold })
      .then((data) => {
        if (active) setListings(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [debounced, category, sort, includeSold]);

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="NEIGHBOURHOOD MARKET"
        title="Market"
        lede="Buy from people in nearby wards, or list something you no longer need. Pickup is arranged between buyer and seller."
      />
      <MarketTabs />

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        <TextField
          label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Item, seller, or ward"
          fullWidth
        />
        <TextField select label="Sort" value={sort} onChange={(event) => setSort(event.target.value as MarketSort)} sx={{ minWidth: 200 }}>
          {SORTS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <Chip label="All" color={category === "" ? "primary" : "default"} onClick={() => setCategory("")} />
        {(Object.keys(CATEGORY_LABEL) as MarketCategory[]).map((key) => (
          <Chip key={key} label={CATEGORY_LABEL[key]} color={category === key ? "primary" : "default"} onClick={() => setCategory(key)} />
        ))}
        <FormControlLabel
          control={<Switch checked={includeSold} onChange={(event) => setIncludeSold(event.target.checked)} />}
          label="Show sold"
          sx={{ ml: { sm: "auto" } }}
        />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!listings && !error && <Loading label="Loading listings" />}
      {listings && listings.length === 0 && (
        <Stack spacing={1.5} sx={{ alignItems: "flex-start", py: 2 }}>
          <Typography color="text.secondary">Nothing matches yet. Try another search, or be the first to list one.</Typography>
          <Button component={RouterLink} to="/market/sell" variant="contained">
            Sell an item
          </Button>
        </Stack>
      )}
      {listings && listings.length > 0 && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {listings.map((item) => (
            <ListingCard key={item.id} item={item} />
          ))}
        </Box>
      )}
    </Stack>
  );
}
