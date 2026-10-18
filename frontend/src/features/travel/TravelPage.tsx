import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet, apiRequest, errorMessage } from "../../api/client";
import type { CityMap, KindQuote, PlaceHint, TravelQuote, TripPoint, Vehicle } from "../../api/types";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { rupees } from "../city/labels";
import { useWard } from "../city/WardContext";
import { bookTravel, useLife } from "../life/store";
import { PageIntro, Surface } from "../life/ui";
import { GooglePlaceField } from "../map/GooglePlaceField";
import { GoogleTravelMap, type RoadRoute } from "../map/GoogleTravelMap";
import { reverseWithGoogle, useTravelMaps } from "../map/googleMaps";
import { PlaceMap, type MapPin } from "../map/PlaceMap";
import { coverUrl } from "../media/api";
import { galleryOf, MediaDialogButton } from "../media/MediaGallery";
import { kindLabel } from "./kinds";
import { TravelDesk } from "./TravelDesk";

type End = "origin" | "destination";

export default function TravelPage() {
  const { user, ready } = useAuth();
  const admin = user?.role === "admin";
  const life = useLife(user?.id ?? null);
  const { wardId } = useWard();
  const maps = useTravelMaps();
  const [map, setMap] = useState<CityMap | null>(null);
  const [origin, setOrigin] = useState<TripPoint | null>(null);
  const [destination, setDestination] = useState<TripPoint | null>(null);
  const [end, setEnd] = useState<End>("origin");
  const [seats, setSeats] = useState(1);
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [quote, setQuote] = useState<TravelQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [managed, setManaged] = useState<Vehicle[]>([]);
  const google = maps.provider === "google" && maps.api ? maps.api : null;

  useEffect(() => {
    const path = wardId ? `/api/v1/city/map?ward_id=${encodeURIComponent(wardId)}` : "/api/v1/city/map";
    let active = true;
    apiGet<CityMap>(path)
      .then((payload) => {
        if (active) setMap(payload);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [wardId]);

  useEffect(() => {
    if (!admin) {
      setManaged([]);
      return;
    }
    let active = true;
    apiGet<{ data: Vehicle[] }>("/api/v1/transit/vehicles/manage")
      .then((payload) => {
        if (active) setManaged(payload.data);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [admin]);

  useEffect(() => {
    if (!origin || !destination) {
      setQuote(null);
      return;
    }
    let active = true;
    setQuoting(true);
    const distanceKm = route ? Math.round(route.distanceKm * 100) / 100 : undefined;
    apiRequest<TravelQuote>("/api/v1/transit/quote", {
      method: "POST",
      body: { origin, destination, seats, ...(distanceKm ? { distance_km: distanceKm } : {}) },
      auth: false,
    })
      .then((payload) => {
        if (!active) return;
        setQuote(payload);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) {
          setQuote(null);
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (active) setQuoting(false);
      });
    return () => {
      active = false;
    };
  }, [origin, destination, seats, route]);

  function pin(end: End, point: TripPoint): MapPin {
    return {
      id: end,
      name: point.label || (end === "origin" ? "Pickup" : "Drop"),
      latitude: point.latitude,
      longitude: point.longitude,
      color: end === "origin" ? "#0f766e" : "#b45309",
      label: end === "origin" ? "From" : "To",
    };
  }

  const pins = useMemo(() => {
    const items: MapPin[] = [];
    if (origin) items.push(pin("origin", origin));
    if (destination) items.push(pin("destination", destination));
    return items;
  }, [origin, destination]);

  async function onPick(latitude: number, longitude: number) {
    const fallback: TripPoint = {
      latitude,
      longitude,
      label: end === "origin" ? "Pickup" : "Drop",
    };
    if (end === "origin") setOrigin(fallback);
    else setDestination(fallback);
    try {
      const label = google
        ? await reverseWithGoogle(google, latitude, longitude, fallback.label)
        : (
            await apiGet<PlaceHint>(
              `/api/v1/transit/places/reverse?latitude=${latitude}&longitude=${longitude}`,
            )
          ).label;
      const point = { latitude, longitude, label };
      if (end === "origin") setOrigin(point);
      else setDestination(point);
    } catch {
      /* keep the pin even if the name lookup fails */
    }
    if (end === "origin" && !destination) setEnd("destination");
  }

  function book(kind: KindQuote, vehicle: Vehicle) {
    if (!user || !quote) {
      setNote("Sign in to book a seat.");
      return;
    }
    bookTravel(
      user.id,
      `${vehicle.name}: ${quote.origin.label} to ${quote.destination.label}`,
      `${kindLabel(kind.kind)} · ${quote.distance_km.toFixed(1)} km · ${kind.minutes} min${kind.per_seat ? ` · ${seats} ${seats === 1 ? "seat" : "seats"}` : " · whole vehicle"} · ${vehicle.contact_name} ${vehicle.phone}`,
      kind.fare_paise,
    );
    setNote("Booked. The trip is on your activity.");
  }

  const trips = life.activity.filter((item) => item.kind === "travel").slice(0, 3);
  const center = origin ?? destination ?? map?.center ?? { latitude: 12.9716, longitude: 77.5946 };

  function syncPublic(next: Vehicle[]) {
    setManaged(next);
  }

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="LOCAL TRANSIT"
        title="Travel"
        lede="Search Google Maps or tap the map for pickup and drop. Road distance is calculated, then city fare rules set the price."
      />
      {error && <Alert severity="error">{error}</Alert>}
      {maps.error && <Alert severity="warning">{maps.error} Using the OpenStreetMap fallback.</Alert>}
      {maps.ready && !google && (
        <Alert severity="info">
          Set GOOGLE_MAPS_API_KEY (Maps JavaScript API and Places API) on the API, or VITE_GOOGLE_MAPS_API_KEY in the web app, to use Google Maps here.
        </Alert>
      )}
      <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 380px" } }}>
        {!maps.ready || (!google && !map) ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress aria-label="Loading map" />
          </Box>
        ) : google ? (
          <GoogleTravelMap
            api={google}
            center={center}
            zoom={14}
            origin={origin}
            destination={destination}
            onPick={onPick}
            onRoute={setRoute}
            height={{ xs: 280, sm: 380, md: 560 }}
          />
        ) : map ? (
          <PlaceMap
            center={center}
            zoom={14}
            height={{ xs: 280, sm: 380, md: 560 }}
            pins={pins}
            onPick={onPick}
            fitPins={pins.length > 0}
            showRoute
          />
        ) : null}
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={end}
            onChange={(_event, next: End | null) => {
              if (next) setEnd(next);
            }}
            aria-label="Which end to set on the map"
          >
            <ToggleButton value="origin">Set pickup</ToggleButton>
            <ToggleButton value="destination">Set drop</ToggleButton>
          </ToggleButtonGroup>
          {google ? (
            <>
              <GooglePlaceField api={google} label="From" value={origin} onChange={setOrigin} onFocus={() => setEnd("origin")} />
              <GooglePlaceField api={google} label="To" value={destination} onChange={setDestination} onFocus={() => setEnd("destination")} />
            </>
          ) : (
            <>
              <PlaceField label="From" value={origin} onChange={setOrigin} onFocus={() => setEnd("origin")} />
              <PlaceField label="To" value={destination} onChange={setDestination} onFocus={() => setEnd("destination")} />
            </>
          )}
          <TextField
            select
            label="Seats"
            value={String(seats)}
            onChange={(event) => setSeats(Number(event.target.value))}
            helperText="Autos and taxis are priced for the vehicle. Buses and metro multiply by seats."
          >
            {[1, 2, 3, 4].map((count) => (
              <MenuItem key={count} value={String(count)}>
                {count}
              </MenuItem>
            ))}
          </TextField>
          {quoting && <Typography color="text.secondary">Calculating distance and fares…</Typography>}
          {quote && (
            <Surface>
              <Typography sx={{ fontWeight: 700 }}>
                {quote.distance_km.toFixed(1)} km · {quote.origin.label} to {quote.destination.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {route
                  ? "Google Maps driving distance. City fare rules set the price."
                  : "Straight-line distance. The meter on the road may be a little higher."}
              </Typography>
            </Surface>
          )}
        </Stack>
      </Box>
      {quote && (
        <Stack spacing={1.5}>
          {quote.quotes.map((item) => (
            <QuoteCard
              key={item.kind}
              quote={item}
              ready={ready}
              signedIn={Boolean(user)}
              onBook={(vehicle) => book(item, vehicle)}
            />
          ))}
        </Stack>
      )}
      {note && <Typography>{note}</Typography>}
      {trips.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="h2">Recent trips</Typography>
          {trips.map((trip) => (
            <Typography key={trip.id} color="text.secondary">
              {trip.title} · {trip.status}
            </Typography>
          ))}
          <Button component={RouterLink} to="/activity" sx={{ alignSelf: "flex-start" }}>
            Open activity
          </Button>
        </Stack>
      )}
      {admin && <TravelDesk vehicles={managed} onChange={syncPublic} />}
      {!admin && ready && (
        <Typography color="text.secondary">A city admin sets kilometres, base fares, and extra charges.</Typography>
      )}
    </Stack>
  );
}

function PlaceField({
  label,
  value,
  onChange,
  onFocus,
}: {
  label: string;
  value: TripPoint | null;
  onChange: (point: TripPoint) => void;
  onFocus: () => void;
}) {
  const [input, setInput] = useState(value?.label ?? "");
  const [options, setOptions] = useState<PlaceHint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2 || q === value?.label) {
      setOptions([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiGet<{ data: PlaceHint[] }>(`/api/v1/transit/places?q=${encodeURIComponent(q)}`)
        .then((payload) => {
          if (active) setOptions(payload.data);
        })
        .catch(() => {
          if (active) setOptions([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [input, value?.label]);

  return (
    <Autocomplete
      freeSolo
      options={options}
      filterOptions={(items) => items}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
      inputValue={input}
      onOpen={onFocus}
      onInputChange={(_event, next, reason) => {
        if (reason !== "reset") setInput(next);
      }}
      onChange={(_event, next) => {
        if (next && typeof next !== "string") {
          onChange({ latitude: next.latitude, longitude: next.longitude, label: next.label });
        }
      }}
      loading={loading}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Search a place or tap the map"
          onFocus={onFocus}
        />
      )}
    />
  );
}

function QuoteCard({
  quote,
  ready,
  signedIn,
  onBook,
}: {
  quote: KindQuote;
  ready: boolean;
  signedIn: boolean;
  onBook: (vehicle: Vehicle) => void;
}) {
  const signIn = useLoginPath();
  const [open, setOpen] = useState(quote.kind === "auto" || quote.kind === "taxi");
  return (
    <Surface>
      <Stack spacing={1.25}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
          <Stack>
            <Typography sx={{ fontWeight: 700 }}>
              {kindLabel(quote.kind)} · {quote.minutes} min
              {quote.night ? " · night fare" : ""}
            </Typography>
            <Typography color="text.secondary">
              {quote.per_seat ? `${rupees(quote.fare_paise)} for the seats you picked` : `${rupees(quote.fare_paise)} for the vehicle`}
            </Typography>
          </Stack>
          <Typography sx={{ fontWeight: 700 }}>{rupees(quote.fare_paise)}</Typography>
        </Stack>
        <Stack spacing={0.25}>
          {quote.breakdown.map((line) => (
            <Stack key={line.label} direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">
                {line.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {rupees(line.amount_paise)}
              </Typography>
            </Stack>
          ))}
        </Stack>
        {quote.vehicles.length === 0 && (
          <Typography color="text.secondary">No {kindLabel(quote.kind).toLowerCase()} is listed right now. The fare still follows city rules.</Typography>
        )}
        {quote.vehicles.length > 0 && (
          <Button onClick={() => setOpen((current) => !current)} sx={{ alignSelf: "flex-start" }}>
            {open ? "Hide vehicles" : `Show ${quote.vehicles.length} ${quote.vehicles.length === 1 ? "vehicle" : "vehicles"}`}
          </Button>
        )}
        {open &&
          quote.vehicles.map((vehicle) => (
            <Stack key={vehicle.id} spacing={1} sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                {coverUrl(vehicle.media) && (
                  <Box
                    component="img"
                    src={coverUrl(vehicle.media) ?? undefined}
                    alt={vehicle.name}
                    loading="lazy"
                    sx={{ width: { xs: "100%", sm: 120 }, height: { xs: 160, sm: 90 }, objectFit: "cover", borderRadius: 1, flex: "0 0 auto" }}
                  />
                )}
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{vehicle.name}</Typography>
                  <Typography color="text.secondary">
                    {vehicle.registration} · {vehicle.seats} seats · {vehicle.contact_name} · {vehicle.phone}
                  </Typography>
                  {vehicle.notes && <Typography color="text.secondary">{vehicle.notes}</Typography>}
                  <MediaDialogButton items={galleryOf(vehicle.media)} title={vehicle.name} />
                </Stack>
              </Stack>
              {ready && !signedIn ? (
                <Button variant="contained" component={RouterLink} to={signIn} sx={{ alignSelf: "flex-start" }}>
                  Sign in to book
                </Button>
              ) : (
                <Button variant="contained" onClick={() => onBook(vehicle)} disabled={!ready} sx={{ alignSelf: "flex-start" }}>
                  Book
                </Button>
              )}
            </Stack>
          ))}
      </Stack>
    </Surface>
  );
}
