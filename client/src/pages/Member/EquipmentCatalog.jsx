import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, getCachedApiData } from "../../services/api";
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

  const [units, setUnits] = useState(() => {
    const cached = getCachedApiData("/machinery-units");
    return Array.isArray(cached?.data) ? cached.data : (Array.isArray(cached) ? cached : []);
  });
  const [unit, setUnit] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(() => !getCachedApiData("/machinery-units"));
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
    if (!getCachedApiData("/machinery-units")) {
      setLoading(true);
    }
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
            {[unit.brand, unit.model].filter(Boolean).length > 0 && (
              <p className="member-muted">{[unit.brand, unit.model].filter(Boolean).join(" · ")}</p>
            )}
            <div className={`member-availability member-availability-${availability === "Available" ? "available" : "unavailable"}`}>
              <i />
              {availability}
            </div>

            {/* Member Rate */}
            <div style={{ margin: "16px 0 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                  {formatPrice(unitRatePerHectare)}
                </span>
                <span style={{ fontSize: "0.95rem", color: "#64748b", fontWeight: 500 }}>
                  / hectare
                </span>
              </div>
              <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 500, display: "block", marginTop: "2px" }}>
                Member Subsidized Rate
              </span>
            </div>

            {/* BOOK NOW Button */}
            <button
              type="button"
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
                width: "100%",
                padding: "14px 24px",
                background: availability === "Available" ? "#1e1e1e" : "#94a3b8",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.95rem",
                fontWeight: 600,
                letterSpacing: "0.03em",
                cursor: availability === "Available" ? "pointer" : "not-allowed",
                transition: "background-color 0.15s ease",
                display: "block",
                textAlign: "center",
                marginBottom: "28px",
              }}
              onMouseEnter={(e) => {
                if (availability === "Available") e.currentTarget.style.background = "#2d2d2d";
              }}
              onMouseLeave={(e) => {
                if (availability === "Available") e.currentTarget.style.background = "#1e1e1e";
              }}
            >
              BOOK NOW
            </button>

            {/* Specifications */}
            <div className="member-product-specs">
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>
                Specifications
              </h2>
              <dl className="member-detail-list">
                <div><dt>Pricing Unit</dt><dd><strong>Per Hectare</strong></dd></div>
                <div><dt>Category</dt><dd>{unit.category || "—"}</dd></div>
                <div><dt>Model</dt><dd>{unit.model || "—"}</dd></div>
                <div><dt>Horsepower</dt><dd>{unit.horsepower ? `${unit.horsepower} HP` : "—"}</dd></div>
                <div><dt>Capacity</dt><dd>{unit.capacity || "—"}</dd></div>
                <div><dt>Fuel Type</dt><dd>{unit.fuelType || "—"}</dd></div>
              </dl>
            </div>

            {/* Description below Specifications */}
            <div style={{ marginTop: "24px" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                Description
              </h2>
              <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                {unit.description || unit.capacity || "Cooperative-maintained machinery, available to eligible members for farm cultivation, planting, harvesting, and field operations."}
              </p>
            </div>
          </section>
        </div>

        {/* ================= KIMPC Machinery Reservation Modal Dialog ================= */}
        {bookingOpen && (
          <div
            className="member-modal-backdrop mb-book-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setBookingOpen(false);
            }}
          >
            <section
              className="member-modal mb-book-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="booking-title"
            >
              <div className="mb-book-header">
                <img
                  className="mb-book-thumb"
                  src={selectedImage || unit.imageUrl || "/images/kimpc logo.png"}
                  alt={unit.name}
                />
                <div className="mb-book-head-main">
                  <h2 id="booking-title" className="mb-book-title">
                    {unit.name}
                  </h2>
                  <p className="mb-book-meta">
                    {[unit.category, unit.brand, unit.model].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="mb-book-rate-pill">
                  {formatPrice(unitRatePerHectare)} / ha
                </span>
                <button
                  type="button"
                  className="mb-book-close"
                  aria-label="Close reservation dialog"
                  onClick={() => setBookingOpen(false)}
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              <form className="mb-book-form" onSubmit={submitBooking}>
                <div className="mb-book-body">
                  <div className="mb-book-section">
                    <div className="mb-book-section-head">
                      <h3 className="mb-book-section-title">Farmland & Location</h3>
                      <span className="mb-book-subtotal">
                        {formatPrice(unitRatePerHectare)} × {requestedHectares} ha = {formatPrice(estimatedCost)}
                      </span>
                    </div>

                    <div className="mb-book-field">
                      <label className="mb-book-label" htmlFor="booking-hectares">
                        <span>
                          Area <span className="mb-book-label-req">*</span>
                        </span>
                      </label>
                      <div className="mb-book-input-wrap">
                        <input
                          id="booking-hectares"
                          className="mb-book-input"
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
                        />
                        <span className="mb-book-unit-tag">ha</span>
                      </div>

                      <div className="mb-book-presets">
                        {[0.5, 1, 2, 3, 5, 10].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setBooking((prev) => ({ ...prev, hectares: preset }))}
                            className={`mb-book-preset-btn${Number(booking.hectares) === preset ? " active" : ""}`}
                          >
                            {preset} ha
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-book-field">
                      <label className="mb-book-label" htmlFor="booking-location">
                        <span>
                          Farm Location <span className="mb-book-label-req">*</span>
                        </span>
                      </label>
                      <div className="mb-book-input-wrap">
                        <MapPinIcon size={15} />
                        <input
                          id="booking-location"
                          className="mb-book-input"
                          type="text"
                          required
                          placeholder="Barangay, Purok / Sitio, Landmark"
                          value={booking.location || ""}
                          onChange={(e) => setBooking((prev) => ({ ...prev, location: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mb-book-section">
                    <div className="mb-book-section-head">
                      <h3 className="mb-book-section-title">Schedule</h3>
                      {booking.start && (
                        <button
                          type="button"
                          className="mb-book-link-btn"
                          onClick={handleClearDates}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="mb-cal-box">
                      <div className="mb-cal-head">
                        <span className="mb-cal-month">{monthNameYear}</span>
                        <div className="mb-cal-nav">
                          <button
                            type="button"
                            className="mb-cal-nav-btn"
                            onClick={handlePrevMonth}
                            disabled={isPrevDisabled}
                            aria-label="Previous month"
                          >
                            <ChevronLeftIcon size={14} />
                          </button>
                          <button
                            type="button"
                            className="mb-cal-nav-btn"
                            onClick={handleNextMonth}
                            aria-label="Next month"
                          >
                            <ChevronRightIcon size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mb-cal-weekdays">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                          <div key={dayName}>{dayName}</div>
                        ))}
                      </div>

                      <div className="mb-cal-grid">
                        {calendarGrid.map((d) => {
                          if (d.isBlank) {
                            return <div key={d.key} className="mb-cal-day is-blank" />;
                          }
                          if (d.isPast) {
                            return (
                              <button key={d.key} type="button" disabled className="mb-cal-day is-past">
                                {d.dayNum}
                              </button>
                            );
                          }
                          if (d.isBooked) {
                            return (
                              <button
                                key={d.key}
                                type="button"
                                disabled
                                title="Reserved"
                                className="mb-cal-day is-booked"
                              >
                                {d.dayNum}
                              </button>
                            );
                          }

                          const isSelectedPoint = booking.start === d.key || booking.end === d.key;
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
                              className={`mb-cal-day${isSelectedPoint ? " is-selected" : inRange ? " is-in-range" : ""}`}
                            >
                              {d.dayNum}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mb-cal-legend">
                        <span className="mb-cal-legend-item">
                          <span className="mb-cal-dot" />
                          Available
                        </span>
                        <span className="mb-cal-legend-item">
                          <span className="mb-cal-dot selected" />
                          Selected
                        </span>
                        <span className="mb-cal-legend-item">
                          <span className="mb-cal-dot booked" />
                          Booked
                        </span>
                      </div>
                    </div>

                    <div className="mb-book-date-row">
                      <div className="mb-book-field">
                        <label className="mb-book-label" htmlFor="booking-start">
                          Start Date
                        </label>
                        <div
                          className="mb-book-input-wrap"
                          style={isStartBooked ? { borderColor: "#dc2626" } : undefined}
                        >
                          <input
                            id="booking-start"
                            className="mb-book-input"
                            required
                            type="date"
                            min={minDate}
                            value={booking.start}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="mb-book-field">
                        <label className="mb-book-label" htmlFor="booking-end">
                          End Date
                        </label>
                        <div
                          className="mb-book-input-wrap"
                          style={isEndBooked || isRangeBlocked ? { borderColor: "#dc2626" } : undefined}
                        >
                          <input
                            id="booking-end"
                            className="mb-book-input"
                            required
                            type="date"
                            min={booking.start || minDate}
                            value={booking.end}
                            onChange={(e) => handleEndDateChange(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {booking.start && booking.end && !isDatesInvalid ? (
                      <div className="mb-book-status-pill">
                        <CheckIcon size={13} />
                        <span>
                          {scheduledDaysCount} day{scheduledDaysCount > 1 ? "s" : ""} ·{" "}
                          {formatDisplayDate(booking.start)} – {formatDisplayDate(booking.end)}
                        </span>
                      </div>
                    ) : booking.start && (!booking.end || booking.start === booking.end) ? (
                      <div className="mb-book-status-pill">
                        <span>Start: {formatDisplayDate(booking.start)} — tap an end date</span>
                      </div>
                    ) : null}

                    {dateError && (
                      <div className="mb-book-status-pill is-warn">
                        <AlertCircleIcon size={14} />
                        <span>{dateError}</span>
                      </div>
                    )}
                  </div>

                  <div className="mb-book-section">
                    <div className="mb-book-section-head">
                      <h3 className="mb-book-section-title">Payment</h3>
                    </div>

                    <div className="mb-pay-tabs">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("Cash")}
                        className={`mb-pay-tab${paymentMethod === "Cash" ? " active" : ""}`}
                      >
                        <BanknoteIcon size={18} />
                        <div>
                          <span className="mb-pay-tab-title">Cash</span>
                          <span className="mb-pay-tab-sub">Depot or field</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod("GCash")}
                        className={`mb-pay-tab${paymentMethod === "GCash" ? " active" : ""}`}
                      >
                        <MobileIcon size={18} />
                        <div>
                          <span className="mb-pay-tab-title">GCash</span>
                          <span className="mb-pay-tab-sub">Upload receipt</span>
                        </div>
                      </button>
                    </div>

                    {paymentMethod === "Cash" && (
                      <div className="mb-pay-subrow">
                        <button
                          type="button"
                          onClick={() => setCashTiming("Upon Pickup")}
                          className={`mb-pay-subbtn${cashTiming === "Upon Pickup" ? " active" : ""}`}
                        >
                          Upon Pickup
                        </button>
                        <button
                          type="button"
                          onClick={() => setCashTiming("Upon Return")}
                          className={`mb-pay-subbtn${cashTiming === "Upon Return" ? " active" : ""}`}
                        >
                          Upon Return
                        </button>
                      </div>
                    )}

                    {paymentMethod === "GCash" && (
                      <div className="mb-gcash-panel">
                        <div className="mb-gcash-bar">
                          <div>
                            <div className="mb-gcash-num">0926 463 8983</div>
                            <div className="mb-gcash-name">KIMPC · Kalilangan Irrigators MPC</div>
                          </div>
                          <button
                            type="button"
                            className="mb-gcash-copy-btn"
                            onClick={handleCopyGcash}
                          >
                            <CopyIcon size={12} />
                            <span>{copiedGcash ? "Copied" : "Copy"}</span>
                          </button>
                        </div>

                        {!gcashPreview ? (
                          <label className="mb-gcash-upload">
                            <UploadCloudIcon size={16} />
                            <span>Upload GCash receipt (PNG/JPG, max 5MB)</span>
                            <input
                              type="file"
                              accept="image/*"
                              required={paymentMethod === "GCash"}
                              onChange={handleGCashFileChange}
                              style={{ display: "none" }}
                            />
                          </label>
                        ) : (
                          <div className="mb-gcash-preview">
                            <div className="mb-gcash-preview-left">
                              <img
                                className="mb-gcash-preview-img"
                                src={gcashPreview}
                                alt="GCash receipt"
                              />
                              <span className="mb-gcash-preview-name">Receipt attached</span>
                            </div>
                            <button
                              type="button"
                              className="mb-book-link-btn"
                              style={{ color: "#dc2626" }}
                              onClick={() => {
                                setGcashProof("");
                                setGcashPreview("");
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mb-book-summary">
                    <div className="mb-book-summary-row">
                      <span>
                        Rate ({formatPrice(unitRatePerHectare)} × {requestedHectares} ha)
                      </span>
                      <span className="mb-book-summary-val">{formatPrice(estimatedCost)}</span>
                    </div>
                    <div className="mb-book-summary-row">
                      <span>Operator</span>
                      <span className="mb-book-summary-val">
                        {unit.operatorIncluded === false
                          ? Number(unit.additionalOperatorFee) > 0
                            ? unit.operatorFeeBasis === "per %"
                              ? `${Number(unit.additionalOperatorFee)}% of rate`
                              : `+${formatPrice(unit.additionalOperatorFee)} ${unit.operatorFeeBasis || "per day"}`
                            : "Not included"
                          : "Included"}
                      </span>
                    </div>
                    <div className="mb-book-summary-row">
                      <span>Payment</span>
                      <span className="mb-book-summary-val">
                        {paymentMethod === "Cash"
                          ? `Cash (${cashTiming})`
                          : gcashProof
                          ? "GCash (Attached)"
                          : "GCash (Receipt needed)"}
                      </span>
                    </div>
                    <div className="mb-book-summary-total">
                      <span>Total Estimate</span>
                      <span className="mb-book-summary-amount">{formatPrice(estimatedCost)}</span>
                    </div>
                  </div>

                  {feedback && (
                    <div className="mb-book-error">
                      <AlertCircleIcon size={15} />
                      <span>{feedback}</span>
                    </div>
                  )}
                </div>

                <div className="mb-book-footer">
                  <button
                    type="button"
                    className="mb-book-btn-cancel"
                    onClick={() => setBookingOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="mb-book-btn-submit"
                    disabled={submitting || isDatesInvalid || (paymentMethod === "GCash" && !gcashProof)}
                  >
                    {submitting
                      ? "Submitting…"
                      : isDatesInvalid
                      ? "Select Dates"
                      : paymentMethod === "GCash" && !gcashProof
                      ? "Attach GCash Receipt"
                      : `Confirm Booking · ${formatPrice(estimatedCost)}`}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* ================= Mobile Phone Number Required Modal ================= */}
        {phonePromptOpen && (
          <div
            className="member-modal-backdrop mb-book-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPhonePromptOpen(false);
            }}
          >
            <section
              className="member-modal mb-book-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="phone-prompt-title"
              style={{ maxWidth: "420px" }}
            >
              <div className="mb-book-header">
                <div className="mb-book-thumb-fallback">
                  <MobileIcon size={18} />
                </div>
                <div className="mb-book-head-main">
                  <h3 id="phone-prompt-title" className="mb-book-title">
                    Mobile Number Required
                  </h3>
                  <p className="mb-book-meta">
                    Used by operators & dispatchers for coordination
                  </p>
                </div>
                <button
                  type="button"
                  className="mb-book-close"
                  aria-label="Close dialog"
                  onClick={() => setPhonePromptOpen(false)}
                >
                  <CloseIcon size={14} />
                </button>
              </div>

              <form className="mb-book-form" onSubmit={handleSavePhone}>
                <div className="mb-book-body">
                  <div className="mb-book-field">
                    <label className="mb-book-label" htmlFor="member-phone-input">
                      <span>
                        Mobile Number <span className="mb-book-label-req">*</span>
                      </span>
                    </label>
                    <div className="mb-book-input-wrap">
                      <MobileIcon size={15} />
                      <input
                        id="member-phone-input"
                        className="mb-book-input"
                        type="tel"
                        required
                        autoFocus
                        placeholder="0917 123 4567"
                        value={newPhoneInput}
                        onChange={(e) => setNewPhoneInput(e.target.value)}
                      />
                    </div>
                  </div>

                  {phoneSaveError && (
                    <div className="mb-book-error">
                      <AlertCircleIcon size={15} />
                      <span>{phoneSaveError}</span>
                    </div>
                  )}
                </div>

                <div className="mb-book-footer">
                  <button
                    type="button"
                    className="mb-book-btn-cancel"
                    onClick={() => setPhonePromptOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="mb-book-btn-submit"
                    disabled={savingPhone}
                  >
                    {savingPhone ? "Saving…" : "Save & Continue"}
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
        title="Browse Machinery"
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search equipment by name, brand, or model..."
      />

      {/* Category Filter */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          style={{
            minWidth: "180px",
            minHeight: "40px",
            padding: "0 12px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#0f172a",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
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
                  {[item.brand, item.model].filter(Boolean).length > 0 && (
                    <p>{[item.brand, item.model].filter(Boolean).join(" · ")}</p>
                  )}

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
