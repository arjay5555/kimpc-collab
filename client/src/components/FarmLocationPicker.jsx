import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../services/api";

const DEFAULT_DEPOT = {
  name: "KIMPC Motor Pool / Depot (Poblacion, Kalilangan)",
  lat: 7.8211,
  lng: 124.7314,
};

function createPinIcon(color, label) {
  return L.divIcon({
    className: "kimpc-map-pin-wrapper",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:auto;">
        <div style="background:${color};color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.28);margin-bottom:2px;border:1.5px solid #fff;">
          ${label}
        </div>
        <div style="width:14px;height:14px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>
      </div>
    `,
    iconSize: [24, 34],
    iconAnchor: [0, 0],
  });
}

function isValidCoord(coords) {
  return (
    coords &&
    Number.isFinite(Number(coords.lat)) &&
    Number.isFinite(Number(coords.lng)) &&
    Math.abs(Number(coords.lat)) > 0.001
  );
}

export default function FarmLocationPicker({
  value,
  onChange,
  readOnly = false,
  height = 240,
  placeholder = "e.g. Purok 4, Ninoy Aquino, Kalilangan, Bukidnon",
}) {
  const currentLocation = typeof value === "string" ? value : (value?.location || "");
  const currentFormatted = typeof value === "object" ? (value?.formattedAddress || "") : "";
  const rawLat = typeof value === "object" ? value?.coordinates?.lat : null;
  const rawLng = typeof value === "object" ? value?.coordinates?.lng : null;
  const currentCoords = useMemo(() => {
    const coords = { lat: rawLat, lng: rawLng };
    return isValidCoord(coords) ? { lat: Number(rawLat), lng: Number(rawLng) } : null;
  }, [rawLat, rawLng]);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const depotMarkerRef = useRef(null);
  const farmMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [depot, setDepot] = useState(DEFAULT_DEPOT);
  const [municipalities, setMunicipalities] = useState([]);
  const [municipalityCode, setMunicipalityCode] = useState("101307000");
  const [barangays, setBarangays] = useState([]);
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [searchText, setSearchText] = useState(currentLocation);
  const [candidates, setCandidates] = useState([]);
  const [routeInfo, setRouteInfo] = useState(() => ({
    distanceKm: value?.distanceKm ?? null,
    durationMinutes: value?.durationMinutes ?? null,
    isRoadRoute: false,
    source: "",
  }));
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    setSearchText(currentLocation);
  }, [currentLocation]);

  const emitChange = useCallback((patch) => {
    if (!onChangeRef.current) return;
    onChangeRef.current({
      location: patch.location ?? currentLocation,
      formattedAddress: patch.formattedAddress ?? currentFormatted ?? patch.location ?? currentLocation,
      coordinates: patch.coordinates !== undefined ? patch.coordinates : currentCoords,
      distanceKm: patch.distanceKm !== undefined ? patch.distanceKm : routeInfo.distanceKm,
      durationMinutes: patch.durationMinutes !== undefined ? patch.durationMinutes : routeInfo.durationMinutes,
    });
  }, [currentLocation, currentFormatted, currentCoords, routeInfo.distanceKm, routeInfo.durationMinutes]);

  const drawRouteOnMap = useCallback((routeLatLngs, farmPos, depotPos) => {
    const map = mapRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (farmMarkerRef.current) {
      farmMarkerRef.current.remove();
      farmMarkerRef.current = null;
    }

    if (isValidCoord(farmPos)) {
      const marker = L.marker([farmPos.lat, farmPos.lng], {
        icon: createPinIcon("#15803d", "Farm Site"),
        draggable: !readOnly,
      }).addTo(map);
      if (!readOnly) {
        marker.on("dragend", async (ev) => {
          const pos = ev.target.getLatLng();
          await handleCoordinatePicked(pos.lat, pos.lng, true);
        });
      }
      farmMarkerRef.current = marker;
    }

    if (Array.isArray(routeLatLngs) && routeLatLngs.length >= 2) {
      routeLayerRef.current = L.polyline(routeLatLngs, {
        color: "#2563eb",
        weight: 4,
        opacity: 0.85,
        dashArray: routeInfo.isRoadRoute ? undefined : "6, 6",
      }).addTo(map);
      try {
        map.fitBounds(routeLayerRef.current.getBounds(), { padding: [28, 28], maxZoom: 15 });
      } catch {
        // Ignore fitBounds if container hidden briefly
      }
    } else if (isValidCoord(farmPos)) {
      const bounds = L.latLngBounds([
        [depotPos.lat, depotPos.lng],
        [farmPos.lat, farmPos.lng],
      ]);
      try {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      } catch {
        map.setView([farmPos.lat, farmPos.lng], 14);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, routeInfo.isRoadRoute]);

  const fetchRouteAndNotify = useCallback(async (lat, lng, nextLocation, nextFormatted) => {
    const res = await api("/geo/route", {
      method: "POST",
      body: { lat, lng },
    });

    if (res.ok && res.data?.ok) {
      const info = {
        distanceKm: res.data.distanceKm ?? null,
        durationMinutes: res.data.durationMinutes ?? null,
        isRoadRoute: Boolean(res.data.isRoadRoute),
        source: res.data.source || "",
      };
      setRouteInfo(info);
      drawRouteOnMap(res.data.routeLatLngs, { lat, lng }, res.data.depot || depot);
      if (!readOnly) {
        emitChange({
          location: nextLocation,
          formattedAddress: nextFormatted || nextLocation,
          coordinates: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
          distanceKm: info.distanceKm,
          durationMinutes: info.durationMinutes,
        });
      }
      return info;
    }
    return null;
  }, [depot, drawRouteOnMap, emitChange, readOnly]);

  const handleCoordinatePicked = useCallback(async (lat, lng, shouldReverse = true) => {
    if (readOnly) return;
    setBusy(true);
    setStatusMsg("Resolving farm address & driving route...");
    const cleanLat = Number(Number(lat).toFixed(6));
    const cleanLng = Number(Number(lng).toFixed(6));

    let label = currentLocation;
    let formatted = currentFormatted;

    if (shouldReverse) {
      const rev = await api(`/geo/reverse?lat=${cleanLat}&lng=${cleanLng}`);
      if (rev.ok && rev.data?.result?.formattedAddress) {
        formatted = rev.data.result.formattedAddress;
        const shortParts = [
          rev.data.result.barangay,
          rev.data.result.municipality || "Kalilangan",
          rev.data.result.province || "Bukidnon",
        ].filter(Boolean);
        label = shortParts.length >= 2 ? shortParts.join(", ") : formatted;
        setSearchText(label);
      }
    }

    await fetchRouteAndNotify(cleanLat, cleanLng, label, formatted);
    setBusy(false);
    setStatusMsg("");
  }, [currentLocation, currentFormatted, fetchRouteAndNotify, readOnly]);

  // Load depot & PSGC dropdowns once (edit mode) or depot only (readOnly mode)
  useEffect(() => {
    let active = true;
    api("/geo/depot").then((res) => {
      if (active && res.ok && res.data?.depot) {
        setDepot(res.data.depot);
      }
    });

    if (!readOnly) {
      api("/geo/psgc/municipalities?provinceCode=101300000").then((res) => {
        if (active && res.ok && Array.isArray(res.data?.municipalities)) {
          setMunicipalities(res.data.municipalities);
        }
      });
    }
    return () => { active = false; };
  }, [readOnly]);

  useEffect(() => {
    if (readOnly) return;
    let active = true;
    api(`/geo/psgc/barangays?municipalityCode=${encodeURIComponent(municipalityCode)}`).then((res) => {
      if (active && res.ok && Array.isArray(res.data?.barangays)) {
        setBarangays(res.data.barangays);
      }
    });
    return () => { active = false; };
  }, [municipalityCode, readOnly]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter = currentCoords
      ? [currentCoords.lat, currentCoords.lng]
      : [DEFAULT_DEPOT.lat, DEFAULT_DEPOT.lng];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: currentCoords ? 14 : 13,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const depotMarker = L.marker([DEFAULT_DEPOT.lat, DEFAULT_DEPOT.lng], {
      icon: createPinIcon("#1d4ed8", "KIMPC Depot"),
      draggable: false,
    }).addTo(map);
    depotMarker.bindPopup(DEFAULT_DEPOT.name);
    depotMarkerRef.current = depotMarker;

    if (!readOnly) {
      map.on("click", (e) => {
        handleCoordinatePicked(e.latlng.lat, e.latlng.lng, true);
      });
    }

    mapRef.current = map;
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      farmMarkerRef.current = null;
      routeLayerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Sync map marker & route when existing coordinates exist (initial mount or modal open)
  const lastLoadedCoordKeyRef = useRef("");
  useEffect(() => {
    if (!mapRef.current || !currentCoords) return;
    const key = `${currentCoords.lat.toFixed(5)},${currentCoords.lng.toFixed(5)}`;
    if (lastLoadedCoordKeyRef.current === key) return;
    lastLoadedCoordKeyRef.current = key;
    fetchRouteAndNotify(currentCoords.lat, currentCoords.lng, currentLocation, currentFormatted);
  }, [currentCoords, currentLocation, currentFormatted, fetchRouteAndNotify]);

  const handleSearchAddress = async (queryOverride) => {
    const q = String(queryOverride ?? searchText).trim();
    if (q.length < 2) {
      setStatusMsg("Enter a barangay, purok, or street in Bukidnon to search.");
      return;
    }
    setBusy(true);
    setCandidates([]);
    setStatusMsg("Searching OpenStreetMap...");
    const res = await api(`/geo/geocode?q=${encodeURIComponent(q)}`);
    setBusy(false);

    if (!res.ok || !Array.isArray(res.data?.results) || res.data.results.length === 0) {
      setStatusMsg("No exact match found. Try clicking directly on your farm in the map below.");
      return;
    }

    const list = res.data.results;
    setCandidates(list);
    setStatusMsg("");
    // Auto-select top match
    const top = list[0];
    await fetchRouteAndNotify(top.lat, top.lng, q, top.formattedAddress);
  };

  const handleBarangaySelect = async (brgyName) => {
    setSelectedBarangay(brgyName);
    if (!brgyName) return;
    const muniObj = municipalities.find((m) => m.code === municipalityCode);
    const muniName = muniObj?.name || "Kalilangan";
    const composed = `Barangay ${brgyName}, ${muniName}, Bukidnon`;
    setSearchText(composed);
    emitChange({ location: composed, formattedAddress: composed });
    await handleSearchAddress(composed);
  };

  const handleUseMyGps = () => {
    if (!navigator.geolocation) {
      setStatusMsg("GPS geolocation is not supported in this browser.");
      return;
    }
    setBusy(true);
    setStatusMsg("Getting current GPS coordinates...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await handleCoordinatePicked(pos.coords.latitude, pos.coords.longitude, true);
      },
      () => {
        setBusy(false);
        setStatusMsg("Location permission was denied. You can click directly on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {!readOnly && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <label style={{ display: "grid", gap: "4px", fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>
              Municipality / City (PSGC)
              <select
                value={municipalityCode}
                onChange={(e) => {
                  setMunicipalityCode(e.target.value);
                  setSelectedBarangay("");
                }}
                style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#fff" }}
              >
                <option value="101307000">Kalilangan (Bukidnon)</option>
                {municipalities
                  .filter((m) => m.code !== "101307000")
                  .map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "4px", fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>
              Barangay (PSGC)
              <select
                value={selectedBarangay}
                onChange={(e) => handleBarangaySelect(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#fff" }}
              >
                <option value="">-- Select Barangay --</option>
                {barangays.map((b) => (
                  <option key={b.code} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                const next = e.target.value;
                setSearchText(next);
                emitChange({ location: next, formattedAddress: next });
              }}
              placeholder={placeholder}
              style={{
                flex: "1 1 240px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSearchAddress()}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                color: "#0f172a",
                fontWeight: 700,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Locate on Map
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleUseMyGps}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontWeight: 700,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Use My GPS
            </button>
          </div>

          {candidates.length > 1 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {candidates.slice(0, 3).map((c, idx) => (
                <button
                  key={`${c.lat}-${c.lng}-${idx}`}
                  type="button"
                  onClick={() => fetchRouteAndNotify(c.lat, c.lng, searchText || c.formattedAddress, c.formattedAddress)}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 9px",
                    borderRadius: "999px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    cursor: "pointer",
                    color: "#334155",
                  }}
                >
                  {c.formattedAddress.split(",").slice(0, 3).join(",")}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: typeof height === "number" ? `${height}px` : height,
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          zIndex: 1,
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", fontSize: "0.8rem" }}>
        <div style={{ color: "#475569" }}>
          {statusMsg ? (
            <span>{statusMsg}</span>
          ) : currentCoords ? (
            <span>
              <strong>Pinned:</strong> {currentCoords.lat.toFixed(5)}, {currentCoords.lng.toFixed(5)}
              {!readOnly && " (click map or drag green pin to refine)"}
            </span>
          ) : (
            <span>{readOnly ? "No farm map coordinates saved." : "Click anywhere on the map or select a Barangay above to pin the farm."}</span>
          )}
        </div>

        {routeInfo.distanceKm !== null && (
          <span
            style={{
              background: "#dcfce7",
              color: "#166534",
              border: "1px solid #86efac",
              padding: "3px 10px",
              borderRadius: "999px",
              fontWeight: 800,
              fontSize: "0.78rem",
            }}
          >
            {routeInfo.distanceKm} km from Depot {routeInfo.durationMinutes ? `• ~${routeInfo.durationMinutes} min drive` : ""}
            {!routeInfo.isRoadRoute ? " (Est.)" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
