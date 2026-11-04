import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import MemberTopbar from "../../components/MemberTopbar";

const EMPTY_BOOKING = { start: "", end: "", hectares: 1, location: "" };

function getAvailability(unit) {
  const condition = (unit?.operatingCondition || unit?.status || "").toLowerCase();
  return ["operational", "available"].includes(condition) ? "Available" : "Unavailable";
}

function formatPrice(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rangeDateKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateKey(date);
}

function formatDisplayDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isDateKeyBooked(dayKey, blockedRanges) {
  if (!dayKey) return false;
  return blockedRanges.some((range) => {
    const startKey = rangeDateKey(range.startDate);
    const endKey = rangeDateKey(range.endDate) || startKey;
    return Boolean(startKey && endKey && startKey <= dayKey && endKey >= dayKey);
  });
}

function hasBookedDatesInRange(startKey, endKey, blockedRanges) {
  if (!startKey || !endKey) return false;
  if (endKey < startKey) return true;
  const cur = new Date(`${startKey}T00:00:00`);
  const last = new Date(`${endKey}T00:00:00`);
  while (cur <= last) {
    const k = dateKey(cur);
    if (isDateKeyBooked(k, blockedRanges)) return true;
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

export default function EquipmentCatalog() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [units, setUnits] = useState([]);
  const [unit, setUnit] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [selectedImage, setSelectedImage] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState(EMPTY_BOOKING);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [dateError, setDateError] = useState("");

  const blockedRanges = useMemo(() => {
    const now = Date.now();
    return [
      ...bookings
        .filter((item) => ["pending", "approved", "checked-out"].includes((item.status || "").toLowerCase()))
        .map((item) => {
          const status = (item.status || "").toLowerCase();
          return {
            startDate: item.startDate,
            endDate: item.endDate,
            label: status === "pending" ? "Pending Approval" : "Reserved / Booked",
          };
        }),
      ...maintenance.map((item) => ({
        startDate: item.startDate,
        endDate: item.endDate,
        label: "Maintenance",
      })),
    ].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  }, [bookings, maintenance]);

  const today = new Date();
  const minDate = dateKey(today);

  // Generate 28-day upcoming selector grid
  const upcomingCalendarDays = useMemo(() => {
    return Array.from({ length: 28 }, (_, index) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index, 12);
      const key = dateKey(d);
      const isBooked = isDateKeyBooked(key, blockedRanges);
      return {
        key,
        dayNum: d.getDate(),
        weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
        monthName: d.toLocaleDateString(undefined, { month: "short" }),
        isBooked,
      };
    });
  }, [blockedRanges]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const response = await api("/machinery-units");
    if (!response.ok) {
      setError(response.data?.error || "Could not load the equipment catalog.");
      setUnits([]);
    } else {
      const list = Array.isArray(response.data?.data) ? response.data.data : [];
      setUnits(list);
      setError("");
    }
    setLoading(false);
  }, []);

  const loadUnit = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [response, availabilityResponse] = await Promise.all([
      api(`/machinery-units/${encodeURIComponent(id)}`),
      api(`/machinery-units/${encodeURIComponent(id)}/availability`),
    ]);
    if (!response.ok) {
      setError(response.data?.error || "Could not load equipment details.");
      setUnit(null);
    } else if (!availabilityResponse.ok) {
      setError(availabilityResponse.data?.error || "Could not load equipment availability.");
      setUnit(null);
    } else {
      const detail = response.data?.data;
      setUnit(detail || null);
      setSelectedImage(detail?.imageUrl || detail?.photos?.[0] || "");
      const periods = Array.isArray(availabilityResponse.data?.data) ? availabilityResponse.data.data : [];
      setBookings(periods.filter((item) => item.type === "booking"));
      setMaintenance(periods.filter((item) => item.type === "maintenance"));
      setError("");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) loadUnit();
    else loadCatalog();
  }, [id, loadCatalog, loadUnit]);

  useEffect(() => {
    api("/member/preferences").then((response) => {
      if (response.ok && response.data?.defaultFarmLocation) {
        setBooking((current) => ({
          ...current,
          location: current.location || response.data.defaultFarmLocation,
        }));
      }
    });
  }, []);

  const categories = useMemo(() => ["All categories", ...new Set(units.map((item) => item.category).filter(Boolean))], [units]);

  const filteredUnits = useMemo(() => {
    return units.filter((item) => {
      const matchesCategory = category === "All categories" || item.category === category;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        [item.name, item.brand, item.model, item.category].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );
      return matchesCategory && matchesSearch;
    });
  }, [category, search, units]);

  const gallery = unit ? [...new Set([unit.imageUrl, ...(unit.photos || [])].filter(Boolean))] : [];

  // Per-hectare rate calculation
  const unitRatePerHectare = Number(unit?.ratePerHectare || unit?.memberRate || 2500);
  const requestedHectares = Math.max(0.1, Number(booking.hectares) || 1);
  const estimatedCost = Math.round(unitRatePerHectare * requestedHectares);

  // Check if current date selection is blocked
  const isStartBooked = isDateKeyBooked(booking.start, blockedRanges);
  const isEndBooked = isDateKeyBooked(booking.end, blockedRanges);
  const isRangeBlocked = hasBookedDatesInRange(booking.start, booking.end, blockedRanges);
  const isDatesInvalid = Boolean(
    !booking.start ||
    !booking.end ||
    booking.end < booking.start ||
    isStartBooked ||
    isEndBooked ||
    isRangeBlocked
  );

  const handleStartDateChange = (val) => {
    setDateError("");
    setFeedback("");
    if (!val) {
      setBooking((prev) => ({ ...prev, start: "" }));
      return;
    }
    if (isDateKeyBooked(val, blockedRanges)) {
      setDateError(`Selected start date (${val}) is already booked for this machinery. Please choose an available date.`);
      setBooking((prev) => ({ ...prev, start: "" }));
      return;
    }
    setBooking((prev) => {
      const nextEnd = prev.end && prev.end < val ? val : prev.end;
      if (nextEnd && hasBookedDatesInRange(val, nextEnd, blockedRanges)) {
        setDateError(`The period from ${val} to ${nextEnd} contains booked dates. Choose an available date.`);
        return { ...prev, start: val, end: "" };
      }
      return { ...prev, start: val, end: nextEnd };
    });
  };

  const handleEndDateChange = (val) => {
    setDateError("");
    setFeedback("");
    if (!val) {
      setBooking((prev) => ({ ...prev, end: "" }));
      return;
    }
    if (isDateKeyBooked(val, blockedRanges)) {
      setDateError(`Selected end date (${val}) is already booked for this machinery. Please choose an available date.`);
      setBooking((prev) => ({ ...prev, end: "" }));
      return;
    }
    if (booking.start && val < booking.start) {
      setDateError("End date must be on or after start date.");
      return;
    }
    if (booking.start && hasBookedDatesInRange(booking.start, val, blockedRanges)) {
      setDateError(`The period from ${booking.start} to ${val} contains dates that are already booked. Choose continuous available dates.`);
      return;
    }
    setBooking((prev) => ({ ...prev, end: val }));
  };

  // Quick select an available date from the interactive strip
  const handleSelectDay = (dayKey) => {
    if (isDateKeyBooked(dayKey, blockedRanges)) {
      return; // Can never select an already booked date
    }
    setDateError("");
    setFeedback("");
    if (!booking.start || (booking.start && booking.end && booking.start !== booking.end)) {
      // Pick as new start date
      setBooking((prev) => ({ ...prev, start: dayKey, end: dayKey }));
    } else if (booking.start && !booking.end) {
      if (dayKey < booking.start) {
        setBooking((prev) => ({ ...prev, start: dayKey, end: dayKey }));
      } else {
        if (hasBookedDatesInRange(booking.start, dayKey, blockedRanges)) {
          setDateError("Cannot select range across already booked dates.");
          return;
        }
        setBooking((prev) => ({ ...prev, end: dayKey }));
      }
    } else {
      if (dayKey < booking.start) {
        setBooking((prev) => ({ ...prev, start: dayKey, end: dayKey }));
      } else {
        if (hasBookedDatesInRange(booking.start, dayKey, blockedRanges)) {
          setDateError("Cannot select range across already booked dates.");
          return;
        }
        setBooking((prev) => ({ ...prev, end: dayKey }));
      }
    }
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!unit || !booking.start || !booking.end || !booking.location.trim()) {
      setFeedback("Please choose rental dates, farm area in hectares, and enter farm location.");
      return;
    }
    if (isDatesInvalid) {
      setFeedback("This machinery is already booked on the selected dates. Please choose an available date.");
      return;
    }

    setSubmitting(true);
    setFeedback("");
    setDateError("");

    const response = await api("/applications", {
      method: "POST",
      body: {
        memberEmail: user?.email,
        equipment: unit.name,
        machineryUnitId: unit.unitId,
        startDate: booking.start,
        endDate: booking.end,
        bookingType: "hectare",
        hectares: requestedHectares,
        ratePerHectare: unitRatePerHectare,
        totalAmount: estimatedCost,
        farmLocation: booking.location.trim(),
      },
    });

    setSubmitting(false);
    if (!response.ok) {
      setFeedback(response.data?.error || "Could not submit the booking request.");
      return;
    }
    setBookingOpen(false);
    setBooking(EMPTY_BOOKING);
    navigate("/applications");
  };

  // Detail View
  if (id) {
    if (loading) return <div className="member-page"><div className="member-rental-skeleton" /></div>;
    if (error || !unit) {
      return (
        <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
          <Link className="member-inline-link" to="/member/book">← Back to equipment catalog</Link>
          <div className="member-empty-state" role="alert">
            <strong>Equipment details unavailable</strong>
            <p>{error}</p>
          </div>
        </div>
      );
    }

    const availability = getAvailability(unit);

    return (
      <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
        <MemberTopbar title="Equipment Details" subtitle={unit.name} />
        <Link className="member-inline-link member-back-link" to="/member/book" style={{ display: "inline-flex", marginBottom: "16px", color: "#166534", fontWeight: 700, textDecoration: "none" }}>
          ← Back to equipment catalog
        </Link>

        <div className="member-product-detail">
          {/* Gallery */}
          <section className="member-product-gallery">
            <img className="member-product-main-image" src={selectedImage || "/images/kimpc logo.png"} alt={unit.name} />
            {gallery.length > 1 && (
              <div className="member-gallery-thumbs">
                {gallery.map((image) => (
                  <button
                    key={image}
                    type="button"
                    className={selectedImage === image ? "active" : ""}
                    onClick={() => setSelectedImage(image)}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Copy and Details */}
          <section className="member-product-copy">
            <p className="member-eyebrow">{unit.category || "Cooperative equipment"}</p>
            <h1 style={{ margin: "0 0 6px", fontSize: "1.85rem", fontWeight: 800, color: "#0f172a" }}>{unit.name}</h1>
            <p className="member-muted">{unit.brand} · {unit.model}</p>
            <div className={`member-availability member-availability-${availability === "Available" ? "available" : "unavailable"}`}>
              <i />
              {availability}
            </div>

            {/* Per-Hectare Pricing Banner */}
            <div
              className="member-product-price"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                padding: "16px 20px",
                borderRadius: "12px",
                margin: "18px 0",
              }}
            >
              <div>
                <span style={{ fontSize: "0.72rem", color: "#166534", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "2px" }}>
                  Member Subsidized Rate
                </span>
                <strong style={{ fontSize: "1.6rem", color: "#14532d", fontWeight: 800 }}>
                  {formatPrice(unitRatePerHectare)}
                  <small style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginLeft: "4px" }}>
                    / hectare
                  </small>
                </strong>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Rental Pricing Unit</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "3px 10px", borderRadius: "999px" }}>
                  Per Hectare (Farm Area)
                </span>
              </div>
            </div>

            <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.5, margin: "0 0 20px" }}>
              {unit.description || unit.capacity || "Cooperative-maintained machinery, available to eligible members for farm cultivation, planting, harvesting, and field operations."}
            </p>

            {/* Changed Booking Button */}
            <button
              type="button"
              className="wz-btn wz-btn-primary"
              disabled={availability !== "Available"}
              onClick={() => {
                setFeedback("");
                setDateError("");
                setBooking({
                  start: "",
                  end: "",
                  hectares: 1,
                  location: localStorage.getItem("member-default-location") || "",
                });
                setBookingOpen(true);
              }}
              style={{
                padding: "12px 28px",
                fontSize: "0.95rem",
                fontWeight: 800,
                borderRadius: "10px",
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                cursor: availability === "Available" ? "pointer" : "not-allowed",
                boxShadow: "0 4px 14px rgba(22, 101, 52, 0.2)",
              }}
            >
              <span>🚜</span>
              <span>Book Machinery (Per Hectare)</span>
              <span aria-hidden="true">→</span>
            </button>

            {/* Specifications */}
            <div className="member-product-specs" style={{ marginTop: "24px" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Specifications</h2>
              <dl className="member-detail-list">
                <div><dt>Pricing Unit</dt><dd><strong>Per Hectare</strong></dd></div>
                <div><dt>Category</dt><dd>{unit.category || "—"}</dd></div>
                <div><dt>Model</dt><dd>{unit.model || "—"}</dd></div>
                <div><dt>Horsepower</dt><dd>{unit.horsepower ? `${unit.horsepower} HP` : "—"}</dd></div>
                <div><dt>Capacity</dt><dd>{unit.capacity || "—"}</dd></div>
                <div><dt>Fuel Type</dt><dd>{unit.fuelType || "—"}</dd></div>
              </dl>
            </div>

            {/* Upcoming Reserved / Blocked Dates list */}
            <div className="member-availability-list" style={{ marginTop: "22px" }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                Current Reservations &amp; Blocked Dates
              </h2>
              {blockedRanges.length === 0 ? (
                <p className="member-muted" style={{ fontSize: "0.82rem" }}>
                  No upcoming reservations currently scheduled. All future dates are open to request.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {blockedRanges.slice(0, 6).map((range, index) => (
                    <div
                      key={`${range.startDate}-${index}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        borderRadius: "8px",
                        fontSize: "0.78rem",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#be123c" }}>
                        🔒 {range.label}
                      </span>
                      <span style={{ color: "#475569", fontWeight: 500 }}>
                        {formatDisplayDate(range.startDate)} – {formatDisplayDate(range.endDate)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ================= Booking Modal Dialog ================= */}
        {bookingOpen && (
          <div
            className="member-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setBookingOpen(false);
            }}
          >
            <section
              className="member-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="booking-title"
              style={{ width: "min(100%, 580px)", maxHeight: "90vh", overflowY: "auto" }}
            >
              <button
                className="member-modal-close"
                type="button"
                aria-label="Close booking form"
                onClick={() => setBookingOpen(false)}
              >
                ×
              </button>

              <p className="member-eyebrow" style={{ color: "#166534" }}>KIMPC MACHINERY RESERVATION</p>
              <h2 id="booking-title" style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
                Book {unit.name}
              </h2>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0 0 16px" }}>
                Pricing is charged <strong>per hectare</strong> of cultivated farm land. Dates already booked cannot be selected.
              </p>

              <form className="member-form" onSubmit={submitBooking}>
                {/* 1. Farm Area in Hectares Input */}
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", display: "flex", justifyContent: "space-between" }}>
                    <span>Farm Area to Cultivate (in Hectares)</span>
                    <span style={{ color: "#15803d", fontWeight: 700 }}>Rate: {formatPrice(unitRatePerHectare)} / ha</span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      required
                      placeholder="e.g. 2.5"
                      value={booking.hectares}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setBooking((prev) => ({
                          ...prev,
                          hectares: isNaN(val) ? "" : Math.max(0.1, val),
                        }));
                      }}
                      style={{
                        width: "160px",
                        padding: "9px 14px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: "#0f172a",
                      }}
                    />
                    <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>Hectare(s)</span>
                  </div>

                  {/* Preset quick buttons */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                    {[0.5, 1, 2, 3, 5, 10].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBooking((prev) => ({ ...prev, hectares: preset }))}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: booking.hectares === preset ? "1.5px solid #16a34a" : "1px solid #cbd5e1",
                          background: booking.hectares === preset ? "#dcfce7" : "#ffffff",
                          color: booking.hectares === preset ? "#15803d" : "#475569",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {preset} ha
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Interactive Date Picker Strip (booked dates are disabled & unclickable) */}
                <div style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                      Select Scheduled Work Dates (Upcoming 4 Weeks)
                    </label>
                    <div style={{ display: "flex", gap: "8px", fontSize: "0.7rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#166534" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#dcfce7", border: "1px solid #16a34a", display: "inline-block" }} />
                        Available
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#991b1b" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#fee2e2", border: "1px solid #f87171", display: "inline-block" }} />
                        Booked (Disabled)
                      </span>
                    </div>
                  </div>

                  {/* 28-day scrollable / grid date picker */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr)",
                      gap: "5px",
                      padding: "8px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      maxHeight: "160px",
                      overflowY: "auto",
                    }}
                  >
                    {upcomingCalendarDays.map((d) => {
                      const isSelectedStart = booking.start === d.key;
                      const isSelectedEnd = booking.end === d.key;
                      const isSelected = isSelectedStart || isSelectedEnd;
                      const inRange = Boolean(
                        booking.start &&
                        booking.end &&
                        d.key >= booking.start &&
                        d.key <= booking.end
                      );

                      if (d.isBooked) {
                        return (
                          <div
                            key={d.key}
                            title={`Already booked on ${d.key}`}
                            style={{
                              background: "#fee2e2",
                              border: "1px solid #fecdd3",
                              color: "#991b1b",
                              borderRadius: "6px",
                              padding: "4px 2px",
                              textAlign: "center",
                              cursor: "not-allowed",
                              opacity: 0.65,
                              userSelect: "none",
                            }}
                          >
                            <div style={{ fontSize: "0.62rem", fontWeight: 600 }}>{d.weekday}</div>
                            <div style={{ fontSize: "0.82rem", fontWeight: 800, textDecoration: "line-through" }}>{d.dayNum}</div>
                            <span style={{ fontSize: "0.55rem", fontWeight: 700, color: "#b91c1c" }}>Booked</span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => handleSelectDay(d.key)}
                          style={{
                            background: isSelected ? "#16a34a" : inRange ? "#dcfce7" : "#ffffff",
                            border: isSelected ? "2px solid #14532d" : "1px solid #cbd5e1",
                            color: isSelected ? "#ffffff" : inRange ? "#14532d" : "#0f172a",
                            borderRadius: "6px",
                            padding: "4px 2px",
                            textAlign: "center",
                            cursor: "pointer",
                            transition: "all 0.12s ease",
                          }}
                        >
                          <div style={{ fontSize: "0.62rem", fontWeight: 600 }}>{d.weekday}</div>
                          <div style={{ fontSize: "0.82rem", fontWeight: 800 }}>{d.dayNum}</div>
                          <span style={{ fontSize: "0.55rem", fontWeight: 600, color: isSelected ? "#ffffff" : "#166534" }}>
                            {isSelected ? "Selected" : "Open"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Start and End Date Inputs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a" }}>
                    Start Date
                    <input
                      required
                      type="date"
                      min={minDate}
                      value={booking.start}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      style={{
                        marginTop: "4px",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: isStartBooked ? "2px solid #ef4444" : "1px solid #cbd5e1",
                      }}
                    />
                  </label>

                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a" }}>
                    End Date
                    <input
                      required
                      type="date"
                      min={booking.start || minDate}
                      value={booking.end}
                      onChange={(e) => handleEndDateChange(e.target.value)}
                      style={{
                        marginTop: "4px",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: isEndBooked || isRangeBlocked ? "2px solid #ef4444" : "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                </div>

                {/* Date Conflict Error */}
                {dateError && (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecdd3",
                      color: "#b91c1c",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                    }}
                  >
                    {dateError}
                  </div>
                )}

                {/* 4. Farm Location */}
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                  Farm Location &amp; Barangay
                  <input
                    required
                    maxLength={240}
                    placeholder="Barangay, Municipality, Land Title / Farm Name"
                    value={booking.location}
                    onChange={(e) => setBooking({ ...booking, location: e.target.value })}
                    style={{
                      marginTop: "4px",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </label>

                {/* 5. Estimated Total Summary Card */}
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    marginTop: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <strong style={{ fontSize: "0.85rem", color: "#166534" }}>Estimated Rental Total:</strong>
                    <strong style={{ fontSize: "1.35rem", color: "#14532d", fontWeight: 800 }}>
                      {formatPrice(estimatedCost)}
                    </strong>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#166534", marginTop: "3px" }}>
                    Calculation: {formatPrice(unitRatePerHectare)} / ha × {requestedHectares} hectare{requestedHectares > 1 ? "s" : ""}
                  </div>
                  {booking.start && booking.end && !isDatesInvalid && (
                    <div style={{ fontSize: "0.73rem", color: "#15803d", marginTop: "2px" }}>
                      Scheduled: {formatDisplayDate(booking.start)} – {formatDisplayDate(booking.end)}
                    </div>
                  )}
                </div>

                {feedback && <p className="member-form-feedback" role="alert">{feedback}</p>}

                {/* Form Actions */}
                <div className="member-form-actions" style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="member-button member-button-outline"
                    onClick={() => setBookingOpen(false)}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="member-button member-button-primary"
                    disabled={submitting || isDatesInvalid || !booking.location.trim()}
                    style={{
                      flex: 2,
                      background: isDatesInvalid ? "#94a3b8" : "#16a34a",
                      cursor: isDatesInvalid ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting
                      ? "Submitting request…"
                      : isDatesInvalid
                      ? "Choose Available Dates"
                      : `Confirm Booking (${formatPrice(estimatedCost)})`}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    );
  }

  // Catalog Grid View
  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
      <MemberTopbar
        title="Book Equipment"
        subtitle="Find the right agricultural machinery for your farm and submit a rental request."
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search equipment by name, brand, or model..."
      />

      {/* Catalog Search & Category Filter */}
      <div className="member-catalog-tools">
        <label className="member-search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search equipment"
            placeholder="Search machinery, brand, or model"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="member-product-grid">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="member-product-skeleton" />
          ))}
        </div>
      ) : error ? (
        <div className="member-empty-state" role="alert">
          <strong>Equipment could not be loaded</strong>
          <p>{error}</p>
          <button className="member-button member-button-outline" onClick={loadCatalog}>
            Try again
          </button>
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="member-empty-state">
          <strong>No machinery found</strong>
          <p>Try a different search term or category filter.</p>
        </div>
      ) : (
        <div className="member-product-grid">
          {filteredUnits.map((item) => {
            const availability = getAvailability(item);
            const rate = Number(item.ratePerHectare || item.memberRate || item.ratePerDay || 2500);

            return (
              <Link
                className="member-product-card"
                key={item._id || item.id || item.unitId}
                to={`/member/book/${encodeURIComponent(item.unitId || item._id || item.id)}`}
              >
                <div className="member-product-image-wrap">
                  <img
                    src={item.imageUrl || item.photos?.[0] || "/images/kimpc logo.png"}
                    alt={item.name}
                    loading="lazy"
                  />
                  <span
                    className={`member-availability member-availability-${
                      availability === "Available" ? "available" : "unavailable"
                    }`}
                  >
                    <i />
                    {availability}
                  </span>
                </div>
                <div className="member-product-card-copy">
                  <span className="member-product-category">{item.category}</span>
                  <h2>{item.name}</h2>
                  <p>{item.brand} · {item.model}</p>

                  {/* Clean Per-Hectare Pricing */}
                  <div
                    className="member-product-card-price"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginTop: "12px",
                      paddingTop: "10px",
                    }}
                  >
                    <strong style={{ fontSize: "1.05rem", color: "#166534" }}>
                      {formatPrice(rate)}
                      <small style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, marginLeft: "4px" }}>
                        / hectare
                      </small>
                    </strong>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        color: "#15803d",
                        background: "#dcfce7",
                        padding: "2px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      Per Hectare
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
