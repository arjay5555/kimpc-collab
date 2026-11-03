import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";

const EMPTY_BOOKING = { mode: "daily", start: "", end: "", location: "" };

function getAvailability(unit) {
  const condition = (unit?.operatingCondition || unit?.status || "").toLowerCase();
  return ["operational", "available"].includes(condition) ? "Available" : "Unavailable";
}

function formatPrice(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function getRentalEstimate(unit, booking) {
  if (!unit || !booking.start || !booking.end) return null;

  const rateValue = booking.mode === "hourly"
    ? (unit.ratePerHour ?? unit.memberRate)
    : (unit.ratePerDay ?? unit.memberRate);
  const rate = Number(rateValue);
  if (!Number.isFinite(rate) || rate < 0) return null;

  let quantity;
  if (booking.mode === "hourly") {
    const duration = new Date(booking.end).getTime() - new Date(booking.start).getTime();
    if (!Number.isFinite(duration) || duration <= 0) return null;
    quantity = Math.ceil(duration / (60 * 60 * 1000));
  } else {
    const start = Date.parse(`${booking.start}T00:00:00Z`);
    const end = Date.parse(`${booking.end}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    quantity = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  }

  return { rate, quantity, total: rate * quantity, unitLabel: booking.mode === "hourly" ? "hour" : "day" };
}

function formatDateTime(value) {
  if (!value) return "Date to be confirmed";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined });
}

function dateBoundary(value, endOfDate = false) {
  if (!value) return null;
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDate ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
  const timestamp = new Date(dateValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
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

function toLocalDateTimeInput(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function overlapsSlot(range, start, end) {
  const slotDay = dateKey(new Date(start));
  const startDay = rangeDateKey(range.startDate);
  const endDay = rangeDateKey(range.endDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(range.startDate || "") && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate || "") && startDay <= slotDay && endDay >= slotDay) return true;
  const startValue = dateBoundary(range.startDate);
  const endValue = dateBoundary(range.endDate, !String(range.endDate || "").includes("T"));
  return startValue !== null && endValue !== null && startValue < end && endValue > start;
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

  const blockedRanges = useMemo(() => [
    ...bookings.filter((item) => ["pending", "approved", "checked-out"].includes((item.status || "").toLowerCase())).map((item) => {
      const start = dateBoundary(item.startDate);
      const end = dateBoundary(item.endDate, !String(item.endDate || "").includes("T"));
      const status = (item.status || "").toLowerCase();
      return {
        startDate: item.startDate,
        endDate: item.endDate,
        label: status === "pending" ? "Pending" : status === "checked-out" && start <= Date.now() && end >= Date.now() ? "In-use" : "Not available",
      };
    }),
    ...maintenance.map((item) => ({ startDate: item.startDate, endDate: item.endDate, label: "Not available" })),
  ].filter((range) => {
    const end = dateBoundary(range.endDate, !String(range.endDate || "").includes("T"));
    return end === null || end >= Date.now();
  }).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))), [bookings, maintenance]);
  const requestedStart = dateBoundary(booking.start);
  const requestedEnd = dateBoundary(booking.end, booking.mode === "daily");
  const rentalEstimate = getRentalEstimate(unit, booking);
  const blockedSelection = Boolean(id && requestedStart !== null && requestedEnd !== null && blockedRanges.some((range) => {
    const blockedStart = dateBoundary(range.startDate);
    const blockedEnd = dateBoundary(range.endDate, !String(range.endDate || "").includes("T"));
    return blockedStart !== null && blockedEnd !== null && blockedStart <= requestedEnd && blockedEnd >= requestedStart;
  }));
  const today = new Date();
  const minDate = dateKey(today);
  const calendarDays = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index, 12);
    return dateKey(date);
  });
  const selectedHourlyDate = booking.start?.slice(0, 10) || minDate;
  const dayStatus = (day) => {
    const range = blockedRanges.find((item) => {
      const start = rangeDateKey(item.startDate);
      const end = rangeDateKey(item.endDate);
      return start && end && start <= day && end >= day;
    });
    return range?.label || "Available";
  };
  const hourlyStatus = (day, hour) => {
    const start = new Date(`${day}T${String(hour).padStart(2, "0")}:00`).getTime();
    if (start < Date.now()) return "Not available";
    const range = blockedRanges.find((item) => overlapsSlot(item, start, start + 60 * 60 * 1000));
    return range?.label || "Available";
  };

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
        setBooking((current) => ({ ...current, location: response.data.defaultFarmLocation }));
      }
    });
  }, []);

  const categories = useMemo(() => ["All categories", ...new Set(units.map((item) => item.category).filter(Boolean))], [units]);
  const filteredUnits = useMemo(() => units.filter((item) => {
    const matchesCategory = category === "All categories" || item.category === category;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [item.name, item.brand, item.model, item.category].some((value) => String(value || "").toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  }), [category, search, units]);
  const gallery = unit ? [...new Set([unit.imageUrl, ...(unit.photos || [])].filter(Boolean))] : [];

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!unit || !booking.start || !booking.end || !booking.location.trim()) {
      setFeedback("Choose a rental period and enter your farm location.");
      return;
    }
    if (blockedSelection) {
      setFeedback("This equipment is not available during the selected period. Choose another slot.");
      return;
    }
    if (booking.mode === "daily" ? booking.end < booking.start : new Date(booking.end) <= new Date(booking.start)) {
      setFeedback("The end time must be after the start time.");
      return;
    }

    setSubmitting(true);
    setFeedback("");
    const response = await api("/applications", {
      method: "POST",
      body: {
        memberEmail: user?.email,
        equipment: unit.name,
        machineryUnitId: unit.unitId,
        startDate: booking.mode === "hourly" ? new Date(booking.start).toISOString() : booking.start,
        endDate: booking.mode === "hourly" ? new Date(booking.end).toISOString() : booking.end,
        bookingType: booking.mode,
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

  if (id) {
    if (loading) return <div className="member-page"><div className="member-rental-skeleton" /></div>;
    if (error || !unit) return <div className="member-page"><Link className="member-inline-link" to="/member/book">← Back to equipment</Link><div className="member-empty-state" role="alert"><strong>Equipment details unavailable</strong><p>{error}</p></div></div>;
    const availability = getAvailability(unit);
    const localDateTime = toLocalDateTimeInput(new Date());

    return (
      <div className="member-page">
        <Link className="member-inline-link member-back-link" to="/member/book">← Back to equipment</Link>
        <div className="member-product-detail">
          <section className="member-product-gallery">
            <img className="member-product-main-image" src={selectedImage || "/images/kimpc logo.png"} alt={unit.name} />
            {gallery.length > 1 && <div className="member-gallery-thumbs">{gallery.map((image) => <button key={image} type="button" className={selectedImage === image ? "active" : ""} onClick={() => setSelectedImage(image)}><img src={image} alt="" /></button>)}</div>}
          </section>
          <section className="member-product-copy">
            <p className="member-eyebrow">{unit.category || "Cooperative equipment"}</p>
            <h1>{unit.name}</h1>
            <p className="member-muted">{unit.brand} · {unit.model}</p>
            <div className={`member-availability member-availability-${availability === "Available" ? "available" : "unavailable"}`}><i />{availability}</div>
            <div className="member-product-price">
              <strong>{formatPrice(unit.ratePerHour || unit.memberRate)} <small>/ hour</small></strong>
              <strong>{formatPrice(unit.ratePerDay || unit.memberRate)} <small>/ day</small></strong>
            </div>
            <p>{unit.description || unit.capacity || "Cooperative-maintained machinery, available to eligible members."}</p>
            <button type="button" className="member-button member-button-primary" disabled={availability !== "Available"} onClick={() => { setFeedback(""); setBooking((current) => ({ ...current, location: current.location || localStorage.getItem("member-default-location") || "" })); setBookingOpen(true); }}>Book this equipment</button>
            <div className="member-product-specs">
              <h2>Specifications</h2>
              <dl className="member-detail-list">
                <div><dt>Category</dt><dd>{unit.category || "—"}</dd></div>
                <div><dt>Model</dt><dd>{unit.model || "—"}</dd></div>
                <div><dt>Horsepower</dt><dd>{unit.horsepower ? `${unit.horsepower} HP` : "—"}</dd></div>
                <div><dt>Capacity</dt><dd>{unit.capacity || "—"}</dd></div>
                <div><dt>Fuel</dt><dd>{unit.fuelType || "—"}</dd></div>
              </dl>
            </div>
            <div className="member-availability-list">
              <h2>Upcoming availability</h2>
              {blockedRanges.length === 0 ? <p className="member-muted">No blocked periods are currently listed.</p> : blockedRanges.slice(0, 8).map((range, index) => <div key={`${range.startDate}-${index}`}><span className={`member-status member-status-${range.label === "Pending" ? "pending" : range.label === "In-use" ? "active" : "muted"}`}>{range.label}</span><span>{formatDateTime(range.startDate)} – {formatDateTime(range.endDate)}</span></div>)}
            </div>
          </section>
        </div>

        {bookingOpen && (
          <div className="member-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBookingOpen(false); }}>
            <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
              <button className="member-modal-close" type="button" aria-label="Close booking form" onClick={() => setBookingOpen(false)}>×</button>
              <p className="member-eyebrow">NEW REQUEST</p>
              <h2 id="booking-title">Book {unit.name}</h2>
              <form className="member-form" onSubmit={submitBooking}>
                <div className="member-mode-toggle" role="group" aria-label="Rental pricing period">
                  {["hourly", "daily"].map((mode) => <button key={mode} type="button" className={booking.mode === mode ? "active" : ""} onClick={() => setBooking((current) => ({ ...current, mode, start: "", end: "" }))}>{mode === "hourly" ? "Hourly" : "Daily"}</button>)}
                </div>
                {booking.mode === "hourly" ? (
                  <>
                    <label>Rental date<input required type="date" min={minDate} value={selectedHourlyDate} onChange={(event) => setBooking((current) => ({ ...current, start: `${event.target.value}T00:00`, end: "" }))} /></label>
                    <div className="member-slot-list"><strong>Hourly availability</strong><div className="member-time-slots">{Array.from({ length: 24 }, (_, hour) => {
                      const status = hourlyStatus(selectedHourlyDate, hour);
                      const start = `${selectedHourlyDate}T${String(hour).padStart(2, "0")}:00`;
                      const end = toLocalDateTimeInput(new Date(new Date(start).getTime() + 60 * 60 * 1000));
                      return <button key={hour} type="button" className={`member-time-slot${booking.start === start ? " selected" : ""}${status !== "Available" ? " unavailable" : ""}`} disabled={status !== "Available"} aria-label={`${String(hour).padStart(2, "0")}:00, ${status}`} onClick={() => setBooking((current) => ({ ...current, start, end }))}><span>{String(hour).padStart(2, "0")}:00</span><small>{status}</small></button>;
                    })}</div></div>
                    <label>End date & time<input required type="datetime-local" min={booking.start || localDateTime} value={booking.end} onChange={(event) => setBooking((current) => ({ ...current, end: event.target.value }))} /></label>
                  </>
                ) : (
                  <>
                    <div className="member-slot-list"><strong>Daily availability (next 30 days)</strong><div className="member-day-slots">{calendarDays.map((day) => {
                      const status = dayStatus(day);
                      const unavailable = status !== "Available";
                      return <button key={day} type="button" className={`member-day-slot${booking.start === day ? " selected" : ""}${unavailable ? " unavailable" : ""}`} disabled={unavailable} aria-label={`${day}, ${status}`} onClick={() => setBooking((current) => ({ ...current, start: day, end: current.end < day ? day : current.end || day }))}><span>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span><small>{status}</small></button>;
                    })}</div></div>
                    <label>Start date<input required type="date" min={minDate} value={booking.start} onChange={(event) => setBooking((current) => ({ ...current, start: event.target.value, end: current.end < event.target.value ? event.target.value : current.end || event.target.value }))} /></label>
                    <label>End date<input required type="date" min={booking.start || minDate} value={booking.end} onChange={(event) => setBooking((current) => ({ ...current, end: event.target.value }))} /></label>
                  </>
                )}
                <label>Farm location<input required maxLength={240} placeholder="Barangay, municipality, farm name" value={booking.location} onChange={(event) => setBooking((current) => ({ ...current, location: event.target.value }))} /></label>
                <div className="member-rental-estimate" aria-live="polite">
                  <div className="member-rental-estimate-heading"><strong>Estimated rental cost</strong>{rentalEstimate && <strong>{formatPrice(rentalEstimate.total)}</strong>}</div>
                  {rentalEstimate
                    ? <p>{formatPrice(rentalEstimate.rate)} per {rentalEstimate.unitLabel} × {rentalEstimate.quantity} {rentalEstimate.unitLabel}{rentalEstimate.quantity === 1 ? "" : "s"}</p>
                    : <p>Select a valid rental period to see the estimate.</p>}
                  <small>Estimate covers the base rental rate only. Any applicable operator, transport, or deposit charges may be additional; final charges will be confirmed by the cooperative.</small>
                </div>
                <div className="member-slot-list"><strong>Availability by period</strong>{blockedRanges.length === 0 ? <p>No blocked periods are currently listed.</p> : blockedRanges.slice(0, 5).map((range, index) => <p key={`${range.startDate}-${index}`}><span>{range.label}</span> · {formatDateTime(range.startDate)} – {formatDateTime(range.endDate)}</p>)}
                  {blockedSelection && <p className="member-slot-conflict" role="alert">Not available for the selected period. Choose another slot to continue.</p>}
                  {!blockedSelection && requestedStart !== null && requestedEnd !== null && <p className="member-slot-available">Selected period is available to request.</p>}
                </div>
                {feedback && <p className="member-form-feedback" role="alert">{feedback}</p>}
                <div className="member-form-actions"><button type="button" className="member-button member-button-outline" onClick={() => setBookingOpen(false)}>Cancel</button><button type="submit" className="member-button member-button-primary" disabled={submitting || blockedSelection}>{submitting ? "Submitting…" : "Confirm booking request"}</button></div>
              </form>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="member-page">
      <header className="member-page-heading">
        <div><p className="member-eyebrow">COOPERATIVE FLEET</p><h1>Book equipment</h1><p className="member-muted">Find the right machinery for your farm and request a rental.</p></div>
      </header>
      <div className="member-catalog-tools">
        <label className="member-search-field"><span aria-hidden="true">⌕</span><input aria-label="Search equipment" placeholder="Search equipment, brand, or model" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((option) => <option key={option}>{option}</option>)}</select>
      </div>
      {loading ? <div className="member-product-grid">{[0, 1, 2, 3].map((item) => <div key={item} className="member-product-skeleton" />)}</div>
        : error ? <div className="member-empty-state" role="alert"><strong>Equipment could not be loaded</strong><p>{error}</p><button className="member-button member-button-outline" onClick={loadCatalog}>Try again</button></div>
          : filteredUnits.length === 0 ? <div className="member-empty-state"><strong>No equipment found</strong><p>Try a different search or category.</p></div>
            : <div className="member-product-grid">{filteredUnits.map((item) => {
              const availability = getAvailability(item);
              return <Link className="member-product-card" key={item._id || item.id || item.unitId} to={`/member/book/${encodeURIComponent(item.unitId || item._id || item.id)}`}>
                <div className="member-product-image-wrap"><img src={item.imageUrl || item.photos?.[0] || "/images/kimpc logo.png"} alt={item.name} loading="lazy" /><span className={`member-availability member-availability-${availability === "Available" ? "available" : "unavailable"}`}><i />{availability}</span></div>
                <div className="member-product-card-copy"><span className="member-product-category">{item.category}</span><h2>{item.name}</h2><p>{item.brand} · {item.model}</p><div className="member-product-card-price"><strong>{formatPrice(item.ratePerHour || item.memberRate)}<small>/hr</small></strong><strong>{formatPrice(item.ratePerDay || item.memberRate)}<small>/day</small></strong></div></div>
              </Link>;
            })}</div>}
    </div>
  );
}
