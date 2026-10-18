import { Autocomplete, TextField } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

import type { TripPoint } from "../../api/types";
import type { GoogleMapsApi, PlacePrediction } from "./googleMaps";

const CITY = { lat: 12.9716, lng: 77.5946 };
const RADIUS_M = 35000;

type GooglePlaceFieldProps = {
  api: GoogleMapsApi;
  label: string;
  value: TripPoint | null;
  onChange: (point: TripPoint) => void;
  onFocus: () => void;
};

export function GooglePlaceField({ api, label, value, onChange, onFocus }: GooglePlaceFieldProps) {
  const [input, setInput] = useState(value?.label ?? "");
  const [options, setOptions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef<unknown>(new api.places.AutocompleteSessionToken());
  const attr = useRef<HTMLDivElement | null>(null);
  if (attr.current === null) {
    attr.current = document.createElement("div");
  }
  const autocomplete = useMemo(() => new api.places.AutocompleteService(), [api]);
  const details = useMemo(() => new api.places.PlacesService(attr.current as HTMLDivElement), [api]);

  useEffect(() => {
    const el = attr.current;
    if (!el) return;
    el.style.display = "none";
    document.body.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);

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
      autocomplete.getPlacePredictions(
        {
          input: q,
          sessionToken: tokenRef.current,
          componentRestrictions: { country: "in" },
          location: new api.LatLng(CITY.lat, CITY.lng),
          radius: RADIUS_M,
        },
        (predictions, status) => {
          if (!active) return;
          setLoading(false);
          setOptions(status === "OK" && predictions ? predictions : []);
        },
      );
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, autocomplete, input, value?.label]);

  function select(prediction: PlacePrediction) {
    details.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["geometry", "name", "formatted_address"],
        sessionToken: tokenRef.current,
      },
      (place, status) => {
        tokenRef.current = new api.places.AutocompleteSessionToken();
        const location = place?.geometry?.location;
        if (status !== "OK" || !place || !location) return;
        const formatted = place.formatted_address?.trim() ?? prediction.description;
        const name = place.name?.trim();
        const labelText = name && formatted && !formatted.toLowerCase().startsWith(name.toLowerCase())
          ? `${name}, ${formatted}`
          : formatted;
        onChange({
          latitude: location.lat(),
          longitude: location.lng(),
          label: labelText.slice(0, 160),
        });
      },
    );
  }

  return (
    <Autocomplete
      value={null}
      options={options}
      filterOptions={(items) => items}
      getOptionLabel={(option) => option.description}
      isOptionEqualToValue={(left, right) => left.place_id === right.place_id}
      inputValue={input}
      onOpen={onFocus}
      onInputChange={(_event, next, reason) => {
        if (reason !== "reset") setInput(next);
      }}
      onChange={(_event, next) => {
        if (next) select(next);
      }}
      loading={loading}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Search Google Maps"
          onFocus={onFocus}
        />
      )}
    />
  );
}
