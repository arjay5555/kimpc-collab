import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import MemberTopbar from "../../components/MemberTopbar";

const EMPTY_BOOKING = {
  start: "",
  end: "",
  hectares: 1,
  location: "",
};

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

function CalendarIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BanknoteIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function MobileIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function UploadCloudIcon({ size = 22, color = "#0284c7" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CheckIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CheckCircleIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function AlertCircleIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CloseIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CopyIcon({ size = 13, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function LockIcon({ size = 13, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function TractorIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17h1" />
      <path d="M7 17a4 4 0 1 0 8 0H7" />
      <circle cx="18" cy="18" r="2" />
      <path d="M15 11h3a2 2 0 0 1 2 2v2" />
      <path d="M7 11V5a2 2 0 0 1 2-2h4l2 4v4" />
      <path d="M11 5v6" />
    </svg>
  );
}

function ChevronLeftIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function MapPinIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
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
  const [memberPhone, setMemberPhone] = useState("");
  const [phonePromptOpen, setPhonePromptOpen] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaveError, setPhoneSaveError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [cashTiming, setCashTiming] = useState("Upon Pickup");
  const [gcashProof, setGcashProof] = useState("");
  const [gcashPreview, setGcashPreview] = useState("");
  const [copiedGcash, setCopiedGcash] = useState(false);

  const handleCopyGcash = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText("09264638983");
      setCopiedGcash(true);
      setTimeout(() => setCopiedGcash(false), 2000);
    }
  };

  const handleGCashFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFeedback("GCash screenshot file is too large (maximum 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setGcashProof(reader.result);
      setGcashPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

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

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const monthNameYear = useMemo(() => {
    return calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [calendarMonth]);

  const isPrevDisabled = useMemo(() => {
    return (
      calendarMonth.getFullYear() === today.getFullYear() &&
      calendarMonth.getMonth() === today.getMonth()
    );
  }, [calendarMonth, today]);

  const handlePrevMonth = () => {
    setCalendarMonth((prev) => {
      const target = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return target < minMonth ? minMonth : target;
    });
  };

  const handleNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const calendarGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const items = [];
    for (let i = 0; i < firstDay; i++) {
      items.push({ isBlank: true, key: `blank-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const key = dateKey(dateObj);
      const isPast = key < minDate;
      const isBooked = isDateKeyBooked(key, blockedRanges);
      items.push({
        isBlank: false,
        dayNum: d,
        key,
        isPast,
        isBooked,
      });
    }
    return items;
  }, [calendarMonth, minDate, blockedRanges]);

  const handleCalendarDayClick = (dayKey) => {
    if (isDateKeyBooked(dayKey, blockedRanges)) {
      return; // Reserved dates cannot be selected
    }
    setDateError("");
    setFeedback("");

    // If no start date or both start & end dates are set (or start !== end), start new selection
    if (!booking.start || (booking.start && booking.end && booking.start !== booking.end)) {
      setBooking((prev) => ({ ...prev, start: dayKey, end: dayKey }));
      return;
    }

    // If start is set and end equals start (or no end)
    if (booking.start && (!booking.end || booking.start === booking.end)) {
      if (dayKey < booking.start) {
        setBooking((prev) => ({ ...prev, start: dayKey, end: dayKey }));
      } else if (dayKey === booking.start) {
        setBooking((prev) => ({ ...prev, end: dayKey }));
      } else {
        if (hasBookedDatesInRange(booking.start, dayKey, blockedRanges)) {
          setDateError("The period between selected dates contains reserved days. Please select an available continuous range.");
          setBooking((prev) => ({ ...prev, start: dayKey, end: dayKey }));
          return;
        }
        setBooking((prev) => ({ ...prev, end: dayKey }));
      }
    }
  };

  const handleClearDates = () => {
    setBooking((prev) => ({ ...prev, start: "", end: "" }));
    setDateError("");
    setFeedback("");
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
        setBooking((current) => ({
          ...current,
          location: current.location || response.data.defaultFarmLocation,
        }));
      }
    });
  }, []);

  const fetchMemberProfile = useCallback(() => {
    if (!user?.email) return;
    api(`/accounts/${encodeURIComponent(user.email)}`).then((res) => {
      if (res.ok && res.data) {
        setMemberPhone((res.data.phone || "").trim());
      }
    });
  }, [user?.email]);

  useEffect(() => {
    fetchMemberProfile();
  }, [fetchMemberProfile]);

  const handleSavePhone = async (e) => {
    e.preventDefault();
    const cleanPhone = newPhoneInput.trim();
    if (!cleanPhone || cleanPhone.length < 7) {
      setPhoneSaveError("Please enter a valid mobile number (e.g. 09171234567 or +63 917 123 4567).");
      return;
    }
    setSavingPhone(true);
    setPhoneSaveError("");
    const res = await api("/member/profile", {
      method: "PATCH",
      body: { phone: cleanPhone },
    });
    setSavingPhone(false);
    if (!res.ok) {
      setPhoneSaveError(res.data?.error || "Could not save mobile number.");
    } else {
      setMemberPhone(cleanPhone);
      setPhonePromptOpen(false);
      setNewPhoneInput("");
      setFeedback("Mobile phone number saved! You can now proceed with your booking.");
      // Open booking modal
      setBooking({
        start: "",
        end: "",
        hectares: 1,
        location: localStorage.getItem("member-default-location") || "",
      });
      setBookingOpen(true);
    }
  };

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

  const scheduledDaysCount = useMemo(() => {
    if (!booking.start || !booking.end || booking.end < booking.start) return 0;
    const s = new Date(`${booking.start}T00:00:00`);
    const e = new Date(`${booking.end}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
    const diffTime = e.getTime() - s.getTime();
    return Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
  }, [booking.start, booking.end]);

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
    const d = new Date(`${val}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
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

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!unit || !booking.start || !booking.end) {
      setFeedback("Please choose rental dates and farm area in hectares.");
      return;
    }
    if (!booking.location || !booking.location.trim()) {
      setFeedback("Please enter the farm location or address for machinery dispatch.");
      return;
    }
    if (isDatesInvalid) {
      setFeedback("This machinery is already booked on the selected dates. Please choose an available date.");
      return;
    }
    if (paymentMethod === "GCash" && !gcashProof) {
      setFeedback("Please upload your GCash payment screenshot proof before confirming.");
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
        paymentMethod,
        cashPaymentOption: paymentMethod === "Cash" ? cashTiming : "",
        gcashProof: paymentMethod === "GCash" ? gcashProof : "",
        paymentStatus: paymentMethod === "GCash" ? "Paid" : "Pending",
        farmerPhone: memberPhone,
        memberPhone,
        farmLocation: (booking.location || "").trim(),
      },
    });

    setSubmitting(false);
    if (!response.ok) {
      setFeedback(response.data?.error || "Could not submit the booking request.");
      return;
    }
    setBookingOpen(false);
    setBooking(EMPTY_BOOKING);
    setGcashProof("");
    setGcashPreview("");
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

            {/* Booking Button */}
            <button
              type="button"
              className="wz-btn wz-btn-primary"
              disabled={availability !== "Available"}
              onClick={() => {
                if (!memberPhone) {
                  setPhonePromptOpen(true);
                  return;
                }
                setFeedback("");
                setDateError("");
                setBooking({
                  start: "",
                  end: "",
                  hectares: 1,
                  location: "",
                });
                setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setPaymentMethod("Cash");
                setCashTiming("Upon Pickup");
                setGcashProof("");
                setGcashPreview("");
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
              <TractorIcon size={18} />
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
                      <span style={{ fontWeight: 700, color: "#be123c", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <LockIcon size={12} /> {range.label}
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

        {/* ================= KIMPC Machinery Reservation Modal Dialog ================= */}
        {bookingOpen && (
          <div
            className="member-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setBookingOpen(false);
            }}
            style={{
              padding: "20px 14px",
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1000,
            }}
          >
            <section
              className="member-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="booking-title"
              style={{
                width: "min(100%, 620px)",
                maxHeight: "92vh",
                overflowY: "auto",
                background: "#ffffff",
                borderRadius: "16px",
                padding: 0,
                border: "1px solid #e2e8f0",
                boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: "20px 24px 16px",
                  borderBottom: "1px solid #f1f5f9",
                  position: "relative",
                  background: "#ffffff",
                }}
              >
                <button
                  type="button"
                  aria-label="Close reservation dialog"
                  onClick={() => setBookingOpen(false)}
                  style={{
                    position: "absolute",
                    top: "16px",
                    right: "18px",
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#64748b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#fee2e2";
                    e.currentTarget.style.color = "#dc2626";
                    e.currentTarget.style.borderColor = "#fecdd3";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f8fafc";
                    e.currentTarget.style.color = "#64748b";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                >
                  <CloseIcon size={16} />
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#15803d",
                      background: "#dcfce7",
                      padding: "2px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    KIMPC Machinery Service
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>•</span>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>
                    Official Member Reservation
                  </span>
                </div>

                <h2
                  id="booking-title"
                  style={{
                    fontSize: "1.32rem",
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: "0 0 14px",
                    lineHeight: 1.25,
                  }}
                >
                  Reserve {unit.name}
                </h2>

                {/* Machinery Identity Card */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                    <img
                      src={selectedImage || unit.imageUrl || "/images/kimpc logo.png"}
                      alt={unit.name}
                      style={{
                        width: "50px",
                        height: "50px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.92rem",
                          fontWeight: 700,
                          color: "#0f172a",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {unit.name}
                      </div>
                      <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "2px" }}>
                        {unit.brand} · {unit.model} · <span style={{ color: "#15803d", fontWeight: 600 }}>{unit.category}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                      Coop Member Rate
                    </div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#15803d" }}>
                      {formatPrice(unitRatePerHectare)}
                      <span style={{ fontSize: "0.74rem", fontWeight: 500, color: "#64748b", marginLeft: "2px" }}>
                        / ha
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Body Form */}
              <form onSubmit={submitBooking} style={{ padding: "20px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  
                  {/* Step 01: Farmland Cultivation Scope */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background: "#dcfce7",
                          color: "#15803d",
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        1
                      </span>
                      <label style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                        Farmland Area to Cultivate
                      </label>
                    </div>
                    <p style={{ fontSize: "0.76rem", color: "#64748b", margin: "0 0 10px 30px" }}>
                      Machinery services are billed strictly per hectare of cultivated land.
                    </p>

                    <div style={{ marginLeft: "30px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        {/* Number Input with unit addon */}
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            overflow: "hidden",
                            background: "#ffffff",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                          }}
                        >
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            required
                            placeholder="1.0"
                            value={booking.hectares}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setBooking((prev) => ({
                                ...prev,
                                hectares: isNaN(val) ? "" : Math.max(0.1, val),
                              }));
                            }}
                            style={{
                              width: "110px",
                              padding: "9px 12px",
                              border: "none",
                              outline: "none",
                              fontSize: "1.05rem",
                              fontWeight: 800,
                              color: "#0f172a",
                            }}
                          />
                          <span
                            style={{
                              padding: "9px 14px",
                              background: "#f1f5f9",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              color: "#475569",
                              borderLeft: "1px solid #e2e8f0",
                              userSelect: "none",
                            }}
                          >
                            Hectares (ha)
                          </span>
                        </div>

                        {/* Quick Presets */}
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                          {[0.5, 1, 2, 3, 5, 10].map((preset) => {
                            const isCurrent = Number(booking.hectares) === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setBooking((prev) => ({ ...prev, hectares: preset }))}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: "6px",
                                  border: isCurrent ? "1.5px solid #16a34a" : "1px solid #cbd5e1",
                                  background: isCurrent ? "#dcfce7" : "#ffffff",
                                  color: isCurrent ? "#15803d" : "#475569",
                                  fontSize: "0.78rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  transition: "all 0.12s ease",
                                }}
                              >
                                {preset} ha
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Formula preview */}
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "0.75rem",
                          color: "#166534",
                          fontWeight: 600,
                        }}
                      >
                        Subtotal: {formatPrice(unitRatePerHectare)} × {requestedHectares} ha ={" "}
                        <span style={{ fontWeight: 800 }}>{formatPrice(estimatedCost)}</span>
                      </div>

                      {/* Farm Location / Dispatch Address */}
                      <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed #e2e8f0" }}>
                        <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                          <MapPinIcon size={14} color="#15803d" />
                          <span>Farm Location / Address *</span>
                        </label>

                        <p style={{ fontSize: "0.74rem", color: "#64748b", margin: "0 0 8px" }}>
                          Enter the barangay, sitio, or landmark for machinery transport and field operations.
                        </p>

                        <input
                          type="text"
                          required
                          placeholder="e.g. Purok 4, Lampanusan, Kalilangan, Bukidnon"
                          value={booking.location || ""}
                          onChange={(e) => setBooking((prev) => ({ ...prev, location: e.target.value }))}
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: "#0f172a",
                            background: "#ffffff",
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 02: Scheduled Work Dates */}
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "50%",
                            background: "#dcfce7",
                            color: "#15803d",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          2
                        </span>
                        <label style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                          Select Scheduled Work Dates
                        </label>
                      </div>
                      {booking.start && (
                        <button
                          type="button"
                          onClick={handleClearDates}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#64748b",
                            fontSize: "0.74rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: "0.76rem", color: "#64748b", margin: "0 0 12px 30px" }}>
                      Click an open date to set dispatch start, then click your completion date. Reserved dates change color and cannot be selected.
                    </p>

                    <div style={{ marginLeft: "30px" }}>
                      {/* Interactive Calendar Container */}
                      <div
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "14px 16px",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                        }}
                      >
                        {/* Calendar Header with Month Navigation */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                            paddingBottom: "8px",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <CalendarIcon size={16} color="#15803d" />
                            <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                              {monthNameYear}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={handlePrevMonth}
                              disabled={isPrevDisabled}
                              aria-label="Previous month"
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "6px",
                                border: "1px solid #e2e8f0",
                                background: isPrevDisabled ? "#f8fafc" : "#ffffff",
                                color: isPrevDisabled ? "#cbd5e1" : "#0f172a",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: isPrevDisabled ? "not-allowed" : "pointer",
                                transition: "all 0.12s ease",
                              }}
                            >
                              <ChevronLeftIcon size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={handleNextMonth}
                              aria-label="Next month"
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "6px",
                                border: "1px solid #e2e8f0",
                                background: "#ffffff",
                                color: "#0f172a",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "all 0.12s ease",
                              }}
                            >
                              <ChevronRightIcon size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Weekday Row */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(7, 1fr)",
                            gap: "4px",
                            textAlign: "center",
                            marginBottom: "6px",
                          }}
                        >
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                            <div
                              key={dayName}
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: "#64748b",
                                padding: "2px 0",
                                userSelect: "none",
                              }}
                            >
                              {dayName}
                            </div>
                          ))}
                        </div>

                        {/* Calendar Days Grid */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(7, 1fr)",
                            gap: "4px",
                          }}
                        >
                          {calendarGrid.map((d) => {
                            if (d.isBlank) {
                              return <div key={d.key} style={{ minHeight: "36px" }} />;
                            }

                            if (d.isPast) {
                              return (
                                <div
                                  key={d.key}
                                  style={{
                                    minHeight: "36px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: "6px",
                                    color: "#cbd5e1",
                                    fontSize: "0.8rem",
                                    userSelect: "none",
                                    background: "#fafafa",
                                  }}
                                >
                                  {d.dayNum}
                                </div>
                              );
                            }

                            if (d.isBooked) {
                              return (
                                <div
                                  key={d.key}
                                  title="Reserved — cannot be selected"
                                  style={{
                                    minHeight: "36px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: "6px",
                                    background: "#fee2e2",
                                    border: "1px solid #fca5a5",
                                    color: "#b91c1c",
                                    cursor: "not-allowed",
                                    userSelect: "none",
                                    padding: "2px 0",
                                  }}
                                >
                                  <span style={{ fontSize: "0.78rem", fontWeight: 700, textDecoration: "line-through" }}>
                                    {d.dayNum}
                                  </span>
                                  <span style={{ fontSize: "0.55rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                                    Reserved
                                  </span>
                                </div>
                              );
                            }

                            const isStart = booking.start === d.key;
                            const isEnd = booking.end === d.key;
                            const isSelectedPoint = isStart || isEnd;
                            const inRange = Boolean(
                              booking.start &&
                              booking.end &&
                              d.key >= booking.start &&
                              d.key <= booking.end
                            );

                            return (
                              <button
                                key={d.key}
                                type="button"
                                onClick={() => handleCalendarDayClick(d.key)}
                                style={{
                                  minHeight: "36px",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: isSelectedPoint ? "6px" : inRange ? "4px" : "6px",
                                  background: isSelectedPoint ? "#15803d" : inRange ? "#dcfce7" : "#ffffff",
                                  border: isSelectedPoint
                                    ? "1.5px solid #14532d"
                                    : inRange
                                    ? "1px solid #86efac"
                                    : "1px solid #e2e8f0",
                                  color: isSelectedPoint ? "#ffffff" : inRange ? "#15803d" : "#0f172a",
                                  fontSize: "0.82rem",
                                  fontWeight: isSelectedPoint || inRange ? 800 : 600,
                                  cursor: "pointer",
                                  padding: "2px 0",
                                  transition: "all 0.12s ease",
                                }}
                              >
                                <span>{d.dayNum}</span>
                                {isSelectedPoint && (
                                  <span style={{ fontSize: "0.52rem", fontWeight: 800, textTransform: "uppercase" }}>
                                    {isStart && isEnd ? "Day" : isStart ? "Start" : "End"}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Calendar Legend Bar */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px",
                            marginTop: "12px",
                            paddingTop: "8px",
                            borderTop: "1px solid #f1f5f9",
                            fontSize: "0.7rem",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#475569" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#ffffff", border: "1px solid #cbd5e1", display: "inline-block" }} />
                              Available
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#15803d", fontWeight: 600 }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#15803d", display: "inline-block" }} />
                              Selected
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#b91c1c", fontWeight: 700 }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#fee2e2", border: "1px solid #fca5a5", display: "inline-block" }} />
                              Reserved (Cannot Select)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Schedule Summary & Synchronized Inputs */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                        <div>
                          <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "#475569", marginBottom: "4px", display: "block" }}>
                            Start Date
                          </label>
                          <input
                            required
                            type="date"
                            min={minDate}
                            value={booking.start}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: isStartBooked ? "2px solid #ef4444" : "1px solid #cbd5e1",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              color: "#0f172a",
                              background: "#ffffff",
                              outline: "none",
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "#475569", marginBottom: "4px", display: "block" }}>
                            End Date
                          </label>
                          <input
                            required
                            type="date"
                            min={booking.start || minDate}
                            value={booking.end}
                            onChange={(e) => handleEndDateChange(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: isEndBooked || isRangeBlocked ? "2px solid #ef4444" : "1px solid #cbd5e1",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              color: "#0f172a",
                              background: "#ffffff",
                              outline: "none",
                            }}
                          />
                        </div>
                      </div>

                      {/* Selected Schedule Status & Duration */}
                      {booking.start && booking.end && !isDatesInvalid ? (
                        <div
                          style={{
                            marginTop: "8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            background: "#dcfce7",
                            color: "#15803d",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                          }}
                        >
                          <CheckIcon size={13} />
                          <span>
                            {scheduledDaysCount} Calendar Day{scheduledDaysCount > 1 ? "s" : ""} Scheduled:{" "}
                            {formatDisplayDate(booking.start)} – {formatDisplayDate(booking.end)}
                          </span>
                        </div>
                      ) : booking.start && (!booking.end || booking.start === booking.end) ? (
                        <div
                          style={{
                            marginTop: "8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            color: "#166534",
                            fontSize: "0.76rem",
                            fontWeight: 600,
                          }}
                        >
                          <span>Start Date: <strong>{formatDisplayDate(booking.start)}</strong>. Click completion date on the calendar.</span>
                        </div>
                      ) : null}

                      {/* Date Conflict Alert */}
                      {dateError && (
                        <div
                          style={{
                            marginTop: "8px",
                            background: "#fef2f2",
                            border: "1px solid #fecdd3",
                            color: "#b91c1c",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <AlertCircleIcon size={16} />
                          <span>{dateError}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 03: Mode of Payment */}
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background: "#dcfce7",
                          color: "#15803d",
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        3
                      </span>
                      <label style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                        Payment Method
                      </label>
                    </div>
                    <p style={{ fontSize: "0.76rem", color: "#64748b", margin: "0 0 10px 30px" }}>
                      Choose between Cash settlement or instant cooperative GCash transfer.
                    </p>

                    <div style={{ marginLeft: "30px" }}>
                      {/* Segmented Cards */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                        {/* Cash Card */}
                        <div
                          onClick={() => setPaymentMethod("Cash")}
                          style={{
                            border: `2px solid ${paymentMethod === "Cash" ? "#15803d" : "#e2e8f0"}`,
                            background: paymentMethod === "Cash" ? "#f0fdf4" : "#ffffff",
                            borderRadius: "10px",
                            padding: "12px 14px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "8px",
                              background: paymentMethod === "Cash" ? "#dcfce7" : "#f1f5f9",
                              color: paymentMethod === "Cash" ? "#15803d" : "#64748b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <BanknoteIcon size={20} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "0.88rem",
                                fontWeight: 700,
                                color: paymentMethod === "Cash" ? "#166534" : "#0f172a",
                              }}
                            >
                              Cash Payment
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "1px" }}>
                              Coop Depot / Field
                            </div>
                          </div>
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              border: `2px solid ${paymentMethod === "Cash" ? "#15803d" : "#cbd5e1"}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {paymentMethod === "Cash" && (
                              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#15803d" }} />
                            )}
                          </div>
                        </div>

                        {/* GCash Card */}
                        <div
                          onClick={() => setPaymentMethod("GCash")}
                          style={{
                            border: `2px solid ${paymentMethod === "GCash" ? "#0284c7" : "#e2e8f0"}`,
                            background: paymentMethod === "GCash" ? "#f0f9ff" : "#ffffff",
                            borderRadius: "10px",
                            padding: "12px 14px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "8px",
                              background: paymentMethod === "GCash" ? "#e0f2fe" : "#f1f5f9",
                              color: paymentMethod === "GCash" ? "#0284c7" : "#64748b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <MobileIcon size={20} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "0.88rem",
                                fontWeight: 700,
                                color: paymentMethod === "GCash" ? "#0369a1" : "#0f172a",
                              }}
                            >
                              GCash E-Wallet
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "1px" }}>
                              Instant E-Transfer
                            </div>
                          </div>
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              border: `2px solid ${paymentMethod === "GCash" ? "#0284c7" : "#cbd5e1"}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {paymentMethod === "GCash" && (
                              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#0284c7" }} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Cash Timing Options */}
                      {paymentMethod === "Cash" && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "12px 14px",
                            borderRadius: "8px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                            Cash Settlement Timing:
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => setCashTiming("Upon Pickup")}
                              style={{
                                padding: "8px 12px",
                                borderRadius: "6px",
                                border: `1.5px solid ${cashTiming === "Upon Pickup" ? "#15803d" : "#cbd5e1"}`,
                                background: cashTiming === "Upon Pickup" ? "#ffffff" : "#f8fafc",
                                color: cashTiming === "Upon Pickup" ? "#15803d" : "#475569",
                                fontSize: "0.78rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                textAlign: "center",
                                transition: "all 0.12s ease",
                              }}
                            >
                              Upon Machinery Pickup
                            </button>
                            <button
                              type="button"
                              onClick={() => setCashTiming("Upon Return")}
                              style={{
                                padding: "8px 12px",
                                borderRadius: "6px",
                                border: `1.5px solid ${cashTiming === "Upon Return" ? "#15803d" : "#cbd5e1"}`,
                                background: cashTiming === "Upon Return" ? "#ffffff" : "#f8fafc",
                                color: cashTiming === "Upon Return" ? "#15803d" : "#475569",
                                fontSize: "0.78rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                textAlign: "center",
                                transition: "all 0.12s ease",
                              }}
                            >
                              Upon Machinery Return
                            </button>
                          </div>
                        </div>
                      )}

                      {/* GCash Payment Panel */}
                      {paymentMethod === "GCash" && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "14px",
                            borderRadius: "10px",
                            background: "#f0f9ff",
                            border: "1px solid #bae6fd",
                          }}
                        >
                          {/* Coop GCash Details */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              background: "#ffffff",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              border: "1px solid #e0f2fe",
                              marginBottom: "12px",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "0.7rem", color: "#0369a1", fontWeight: 700, textTransform: "uppercase" }}>
                                KIMPC Official GCash
                              </div>
                              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>
                                Kalilangan Irrigators MPC
                              </div>
                              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0369a1", letterSpacing: "0.04em", marginTop: "2px" }}>
                                0926 463 8983
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleCopyGcash}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "6px 10px",
                                borderRadius: "6px",
                                border: "1px solid #bae6fd",
                                background: copiedGcash ? "#dcfce7" : "#e0f2fe",
                                color: copiedGcash ? "#15803d" : "#0369a1",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              <CopyIcon size={12} />
                              <span>{copiedGcash ? "Copied!" : "Copy Number"}</span>
                            </button>
                          </div>

                          {/* Screenshot Upload Dropzone */}
                          <div>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0369a1", display: "block", marginBottom: "6px" }}>
                              Attach GCash Payment Screenshot / Receipt *
                            </label>

                            {!gcashPreview ? (
                              <label
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "18px 14px",
                                  borderRadius: "8px",
                                  border: "2px dashed #93c5fd",
                                  background: "#ffffff",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <UploadCloudIcon size={24} />
                                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0284c7", marginTop: "6px" }}>
                                  Click or tap to upload receipt
                                </span>
                                <span style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>
                                  PNG, JPG or JPEG (Max 5MB)
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  required={paymentMethod === "GCash"}
                                  onChange={handleGCashFileChange}
                                  style={{ display: "none" }}
                                />
                              </label>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "10px 14px",
                                  background: "#ffffff",
                                  borderRadius: "8px",
                                  border: "1px solid #93c5fd",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <img
                                    src={gcashPreview}
                                    alt="Receipt proof"
                                    style={{
                                      width: "48px",
                                      height: "64px",
                                      objectFit: "cover",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                    }}
                                  />
                                  <div>
                                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#15803d", display: "flex", alignItems: "center", gap: "4px" }}>
                                      <CheckCircleIcon size={14} /> Screenshot Attached
                                    </div>
                                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>
                                      Ready for verification
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setGcashProof("");
                                    setGcashPreview("");
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid #fecdd3",
                                    background: "#fee2e2",
                                    color: "#dc2626",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 04: Reservation & Cost Breakdown */}
                  <div
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      background: "#f8fafc",
                      padding: "14px 18px",
                      marginTop: "6px",
                    }}
                  >
                    <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                      Reservation Cost Breakdown
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.78rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                        <span>Subsidized Rate ({formatPrice(unitRatePerHectare)} × {requestedHectares} ha)</span>
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{formatPrice(estimatedCost)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                        <span>Farm Destination</span>
                        <span style={{ fontWeight: 600, color: "#0f172a", textAlign: "right", maxWidth: "60%" }}>
                          {booking.location || "Not specified"}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                        <span>Cooperative Machinery Operator</span>
                        <span style={{ fontWeight: 600, color: "#15803d" }}>Included</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                        <span>CDA Cooperative Tax (RA 9520)</span>
                        <span style={{ fontWeight: 600, color: "#15803d" }}>Tax-Exempt</span>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "10px",
                        paddingTop: "10px",
                        borderTop: "1px solid #cbd5e1",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#0f172a" }}>
                          Total Subsidized Amount:
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                          Payment: {paymentMethod} {paymentMethod === "Cash" ? `(${cashTiming})` : "(Receipt Verified)"}
                        </div>
                      </div>
                      <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#15803d" }}>
                        {formatPrice(estimatedCost)}
                      </div>
                    </div>
                  </div>

                  {feedback && (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: "#fef2f2",
                        border: "1px solid #fecdd3",
                        color: "#b91c1c",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                      }}
                    >
                      {feedback}
                    </div>
                  )}
                </div>

                {/* Modal Footer Actions */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    marginTop: "20px",
                    paddingTop: "16px",
                    borderTop: "1px solid #f1f5f9",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setBookingOpen(false)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#475569",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || isDatesInvalid || (paymentMethod === "GCash" && !gcashProof)}
                    style={{
                      flex: 1,
                      padding: "11px 22px",
                      borderRadius: "8px",
                      border: "none",
                      background: isDatesInvalid || (paymentMethod === "GCash" && !gcashProof) ? "#94a3b8" : "#15803d",
                      color: "#ffffff",
                      fontSize: "0.9rem",
                      fontWeight: 800,
                      cursor: isDatesInvalid || (paymentMethod === "GCash" && !gcashProof) ? "not-allowed" : "pointer",
                      boxShadow: isDatesInvalid || (paymentMethod === "GCash" && !gcashProof) ? "none" : "0 4px 12px rgba(21, 128, 61, 0.25)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {submitting
                      ? "Submitting Reservation…"
                      : isDatesInvalid
                      ? "Select Available Dates"
                      : paymentMethod === "GCash" && !gcashProof
                      ? "Upload GCash Screenshot Proof"
                      : `Confirm Reservation · ${formatPrice(estimatedCost)}`}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* ================= Mobile Phone Number Required Modal ================= */}
        {phonePromptOpen && (
          <div
            className="member-modal-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPhonePromptOpen(false);
            }}
            style={{
              padding: "20px 14px",
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1000,
            }}
          >
            <section
              className="member-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="phone-prompt-title"
              style={{
                maxWidth: "460px",
                width: "95%",
                borderRadius: "16px",
                background: "#ffffff",
                padding: "24px 28px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 20px 45px -10px rgba(15, 23, 42, 0.2)",
              }}
            >
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setPhonePromptOpen(false)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "18px",
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <CloseIcon size={14} />
              </button>
              <div style={{ textAlign: "center", marginBottom: "18px" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#2563eb",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "12px",
                  }}
                >
                  <MobileIcon size={22} color="#2563eb" />
                </div>
                <h3
                  id="phone-prompt-title"
                  style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}
                >
                  Mobile Contact Number Required
                </h3>
                <p style={{ fontSize: "0.82rem", color: "#64748b", margin: 0, lineHeight: 1.45 }}>
                  A verified mobile contact number is required to book cooperative equipment. Our machinery operators and dispatchers will call or SMS you to coordinate field logistics.
                </p>
              </div>

              <form onSubmit={handleSavePhone}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Your Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    autoFocus
                    placeholder="e.g. 09171234567 or +63 917 123 4567"
                    value={newPhoneInput}
                    onChange={(e) => setNewPhoneInput(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: "#0f172a",
                      outline: "none",
                    }}
                  />
                  {phoneSaveError && (
                    <p style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "6px", marginBottom: 0 }}>
                      {phoneSaveError}
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setPhonePromptOpen(false)}
                    style={{
                      padding: "9px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#475569",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPhone}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#15803d",
                      color: "#ffffff",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: savingPhone ? "wait" : "pointer",
                    }}
                  >
                    {savingPhone ? "Saving Profile…" : "Save to Profile & Continue"}
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
