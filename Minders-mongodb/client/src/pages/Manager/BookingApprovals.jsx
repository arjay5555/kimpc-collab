import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

// Initial seed mock bookings that match the KIMPC design perfectly
const INITIAL_MOCK_BOOKINGS = [
  {
    id: "BK-WZ1001",
    bookingDate: "Aug 1, 2028",
    clientName: "Alice Johnson",
    clientEmail: "alice.johnson@example.com",
    clientPhone: "+63 917 123 4567",
    clientAddress: "Barangay 4, Malaybalay City, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1001",
    machineryModel: "John Deere 5075E",
    category: "Tractor",
    plan: "2 Days",
    daysCount: 2,
    dailyRate: 2800,
    dateRange: "Aug 1, 2028 to Aug 2, 2028",
    hasDriver: false,
    assignedDriver: "Self-Operated",
    receiptNo: "REC-2028-0001",
    paymentMethod: "Cash",
    paymentAmount: "₱5,600",
    paymentStatus: "Paid",
    status: "Returned",
  },
  {
    id: "BK-WZ1002",
    bookingDate: "Aug 1, 2028",
    clientName: "Bob Smith",
    clientEmail: "bob.smith@example.com",
    clientPhone: "+63 928 234 5678",
    clientAddress: "Purok 2, Maramag, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1002",
    machineryModel: "Kubota DC-70 Plus",
    category: "Harvester",
    plan: "7 Days",
    daysCount: 7,
    dailyRate: 5500,
    dateRange: "Aug 1, 2028 to Aug 8, 2028",
    hasDriver: true,
    assignedDriver: "Daniel Jackson",
    receiptNo: "REC-2028-0002",
    paymentMethod: "GCash",
    paymentAmount: "₱38,500",
    paymentStatus: "Pending",
    status: "Ongoing",
  },
  {
    id: "BK-WZ1003",
    bookingDate: "Aug 2, 2028",
    clientName: "Charlie Davis",
    clientEmail: "charlie.davis@example.com",
    clientPhone: "+63 939 345 6789",
    clientAddress: "Valencia City, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1003",
    machineryModel: "New Holland Roll-Belt 450",
    category: "Baler",
    plan: "31 Days",
    daysCount: 31,
    dailyRate: 3200,
    dateRange: "Aug 2, 2028 to Sep 2, 2028",
    hasDriver: false,
    assignedDriver: "Self-Operated",
    receiptNo: "REC-2028-0003",
    paymentMethod: "Bank Transfer",
    paymentAmount: "₱99,200",
    paymentStatus: "Paid",
    status: "Ongoing",
  },
  {
    id: "BK-WZ1004",
    bookingDate: "Aug 2, 2028",
    clientName: "Diana White",
    clientEmail: "diana.white@example.com",
    clientPhone: "+63 915 456 7890",
    clientAddress: "Manolo Fortich, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1004",
    machineryModel: "Case IH Farmall 90JX",
    category: "Tractor",
    plan: "1 Day",
    daysCount: 1,
    dailyRate: 3600,
    dateRange: "Aug 2, 2028 to Aug 3, 2028",
    hasDriver: true,
    assignedDriver: "James Evans",
    receiptNo: "REC-2028-0004",
    paymentMethod: "Cash",
    paymentAmount: "₱3,600",
    paymentStatus: "Paid",
    status: "Returned",
  },
  {
    id: "BK-WZ1005",
    bookingDate: "Aug 3, 2028",
    clientName: "Edward Green",
    clientEmail: "edward.green@example.com",
    clientPhone: "+63 920 567 8901",
    clientAddress: "Quezon, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1005",
    machineryModel: "Kuhn GA 4121 GM",
    category: "Mower / Rake",
    plan: "8 Days",
    daysCount: 8,
    dailyRate: 1900,
    dateRange: "Aug 3, 2028 to Aug 10, 2028",
    hasDriver: false,
    assignedDriver: "Self-Operated",
    receiptNo: "REC-2028-0005",
    paymentMethod: "GCash",
    paymentAmount: "₱15,200",
    paymentStatus: "Pending",
    status: "Cancelled",
  },
  {
    id: "BK-WZ1006",
    bookingDate: "Aug 3, 2028",
    clientName: "Fiona Brown",
    clientEmail: "fiona.brown@example.com",
    clientPhone: "+63 916 678 9012",
    clientAddress: "Don Carlos, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1006",
    machineryModel: "Ag Leader Precision Boom Sprayer",
    category: "Sprayer",
    plan: "32 Days",
    daysCount: 32,
    dailyRate: 2100,
    dateRange: "Aug 3, 2028 to Sep 3, 2028",
    hasDriver: true,
    assignedDriver: "John Adams",
    receiptNo: "REC-2028-0006",
    paymentMethod: "Bank Transfer",
    paymentAmount: "₱67,200",
    paymentStatus: "Paid",
    status: "Ongoing",
  },
  {
    id: "BK-WZ1007",
    bookingDate: "Aug 4, 2028",
    clientName: "George Clark",
    clientEmail: "george.clark@example.com",
    clientPhone: "+63 927 789 0123",
    clientAddress: "Impasug-ong, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1007",
    machineryModel: "Isuzu Forward Flatbed Hauler",
    category: "Transport",
    plan: "2 Days",
    daysCount: 2,
    dailyRate: 4200,
    dateRange: "Aug 4, 2028 to Aug 5, 2028",
    hasDriver: false,
    assignedDriver: "Self-Operated",
    receiptNo: "REC-2028-0007",
    paymentMethod: "Cash",
    paymentAmount: "₱8,400",
    paymentStatus: "Paid",
    status: "Returned",
  },
  {
    id: "BK-WZ1008",
    bookingDate: "Aug 4, 2028",
    clientName: "Helen Martinez",
    clientEmail: "helen.martinez@example.com",
    clientPhone: "+63 918 890 1234",
    clientAddress: "San Fernando, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1008",
    machineryModel: "John Deere 5075E",
    category: "Tractor",
    plan: "7 Days",
    daysCount: 7,
    dailyRate: 2800,
    dateRange: "Aug 4, 2028 to Aug 11, 2028",
    hasDriver: true,
    assignedDriver: "Michael Clark",
    receiptNo: "REC-2028-0008",
    paymentMethod: "GCash",
    paymentAmount: "₱19,600",
    paymentStatus: "Pending",
    status: "Cancelled",
  },
  {
    id: "BK-WZ1009",
    bookingDate: "Aug 5, 2028",
    clientName: "Ivan Rodriguez",
    clientEmail: "ivan.rodriguez@example.com",
    clientPhone: "+63 929 901 2345",
    clientAddress: "Kibawe, Bukidnon",
    clientAvatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80",
    coopId: "COOP-MB-1009",
    machineryModel: "Kubota DC-70 Plus",
    category: "Harvester",
    plan: "31 Days",
    daysCount: 31,
    dailyRate: 5500,
    dateRange: "Aug 5, 2028 to Sep 5, 2028",
    hasDriver: false,
    assignedDriver: "Self-Operated",
    receiptNo: "REC-2028-0009",
    paymentMethod: "Bank Transfer",
    paymentAmount: "₱170,500",
    paymentStatus: "Paid",
    status: "Ongoing",
  },
];

// Bidirectional Chart Data for the 12 months
const MONTHLY_CHART_DATA = [
  { month: "Jan", done: 65, canceled: 50 },
  { month: "Feb", done: 70, canceled: 55 },
  { month: "Mar", done: 85, canceled: 70 },
  { month: "Apr", done: 80, canceled: 65 },
  { month: "May", done: 75, canceled: 60 },
  { month: "Jun", done: 95, canceled: 72, highlighted: true, doneCount: 586 },
  { month: "Jul", done: 82, canceled: 68 },
  { month: "Aug", done: 72, canceled: 58 },
  { month: "Sep", done: 84, canceled: 70 },
  { month: "Oct", done: 88, canceled: 75 },
  { month: "Nov", done: 76, canceled: 62 },
  { month: "Dec", done: 90, canceled: 78 },
];

export default function BookingApprovals() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Bookings list state
  const [liveBookings, setLiveBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [chartPeriod, setChartPeriod] = useState("By Year");

  // Selected item (year/month) for interactive click tooltip in Overview chart (null until clicked)
  const [clickedItemIndex, setClickedItemIndex] = useState(null);
  const [financialsOpen, setFinancialsOpen] = useState(false);

  // Status overrides, booking data overrides, deleted bookings, and view modal
  const [statusOverrides, setStatusOverrides] = useState({});
  const [bookingOverrides, setBookingOverrides] = useState({});
  const [deletedIds, setDeletedIds] = useState([]);
  const [viewingBooking, setViewingBooking] = useState(null);
  const [previewGcashImage, setPreviewGcashImage] = useState(null);
  const [modalStatus, setModalStatus] = useState("");
  const [modalRejectionReason, setModalRejectionReason] = useState("");
  const [modalVoidReason, setModalVoidReason] = useState("");
  const [modalStartDate, setModalStartDate] = useState("2028-08-01");
  const [modalEndDate, setModalEndDate] = useState("2028-08-05");

  // Manager action to verify and settle payment
  const handleSettlePayment = async (booking) => {
    if (!booking) return;
    const currentRawId = booking.rawId;
    const currentId = booking.id;
    if (!window.confirm(`Confirm payment settlement for booking ${currentId}? This will verify the payment, issue receipt voucher, and notify the member.`)) {
      return;
    }
    if (currentRawId) {
      setFeedback({ message: `Settling payment for ${currentId}...`, isError: false });
      try {
        const res = await api(`/applications/${currentRawId}`, {
          method: "PATCH",
          body: { paymentStatus: "Paid" },
        });
        if (res.ok) {
          setFeedback({ message: `Payment for booking ${currentId} marked as Paid!`, isError: false });
          setViewingBooking((prev) => prev ? { ...prev, paymentStatus: "Paid" } : null);
          fetchData();
        } else {
          setFeedback({ message: res.data?.error || "Failed to settle payment.", isError: true });
        }
      } catch (err) {
        setFeedback({ message: "Network error settling payment.", isError: true });
      }
    } else {
      setBookingOverrides((prev) => ({
        ...prev,
        [currentId]: { ...(prev[currentId] || {}), paymentStatus: "Paid" },
      }));
      setViewingBooking((prev) => prev ? { ...prev, paymentStatus: "Paid" } : null);
      setFeedback({ message: `Payment for booking ${currentId} marked as Paid!`, isError: false });
    }
  };

  // Helper to extract ISO date strings or fallback
  const getBookingDates = (booking) => {
    let s = booking.startDateISO;
    let e = booking.endDateISO;
    if (!s || !e) {
      if (booking.dateRange && booking.dateRange.includes(" to ")) {
        const parts = booking.dateRange.split(" to ");
        const d1 = new Date(parts[0]);
        const d2 = new Date(parts[1]);
        if (!isNaN(d1.getTime())) s = d1.toISOString().split("T")[0];
        if (!isNaN(d2.getTime())) e = d2.toISOString().split("T")[0];
      }
    }
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0];
    return {
      s: s || today,
      e: e || nextWeek,
    };
  };

  // Open modal in View mode
  const handleOpenViewModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setModalStatus(booking.status);
    setModalRejectionReason(booking.rejectionReason || "");
    setModalVoidReason(booking.voidReason || "");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Open modal directly for Reject
  const handleOpenRejectModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setModalStatus("Rejected");
    setModalRejectionReason(booking.rejectionReason || "Machinery Under Maintenance");
    setModalVoidReason(booking.voidReason || "");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Open modal directly for Reschedule
  const handleOpenRescheduleModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setModalStatus("Rescheduled");
    setModalRejectionReason(booking.rejectionReason || "");
    setModalVoidReason(booking.voidReason || "");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Open modal directly for Void
  const handleOpenVoidModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setModalStatus("Voided");
    setModalRejectionReason(booking.rejectionReason || "");
    setModalVoidReason(booking.voidReason || "Administrative Cancellation");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Close modal without saving (changes are discarded)
  const handleCloseViewModal = () => {
    setViewingBooking(null);
    setModalStatus("");
    setModalRejectionReason("");
    setModalVoidReason("");
  };

  // Save changes from modal
  const handleSaveModalStatus = async () => {
    if (!viewingBooking) return;
    const currentId = viewingBooking.id;
    const currentRawId = viewingBooking.rawId;
    const targetStatus = modalStatus || viewingBooking.status;

    const updatedFields = {
      status: targetStatus,
    };

    if (targetStatus === "Rejected") {
      updatedFields.rejectionReason = modalRejectionReason || "No reason specified";
    }

    if (targetStatus === "Voided") {
      updatedFields.voidReason = modalVoidReason || "Administrative Cancellation";
      updatedFields.paymentStatus = "Voided";
    }

    if (targetStatus === "Rescheduled" && modalStartDate && modalEndDate) {
      const d1 = new Date(modalStartDate);
      const d2 = new Date(modalEndDate);
      const diffTime = Math.max(0, d2 - d1);
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const dailyRate = viewingBooking.dailyRate || 2800;
      const totalAmount = dailyRate * days;

      const formattedStart = d1.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const formattedEnd = d2.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      updatedFields.startDateISO = modalStartDate;
      updatedFields.endDateISO = modalEndDate;
      updatedFields.plan = `${days} Day${days === 1 ? "" : "s"}`;
      updatedFields.daysCount = days;
      updatedFields.dateRange = `${formattedStart} to ${formattedEnd}`;
      updatedFields.paymentAmount = `₱${totalAmount.toLocaleString()}`;
    }

    // Save in local overrides
    setStatusOverrides((prev) => ({
      ...prev,
      [currentId]: targetStatus,
      ...(currentRawId ? { [currentRawId]: targetStatus } : {}),
    }));

    setBookingOverrides((prev) => ({
      ...prev,
      [currentId]: { ...(prev[currentId] || {}), ...updatedFields },
      ...(currentRawId ? { [currentRawId]: { ...(prev[currentRawId] || {}), ...updatedFields } } : {}),
    }));

    if (currentRawId) {
      setFeedback({ message: `Updating booking ${currentId} to ${targetStatus}...`, isError: false });
      try {
        const res = await api(`/applications/${currentRawId}`, {
          method: "PATCH",
          body: {
            status: targetStatus === "Voided" ? "Cancelled" : targetStatus,
            rejectionReason: updatedFields.rejectionReason,
            voidReason: updatedFields.voidReason,
            startDate: updatedFields.startDateISO,
            endDate: updatedFields.endDateISO,
            isVoid: targetStatus === "Voided",
          },
        });
        if (!res.ok) {
          setFeedback({ message: res.data?.error || `Failed to update status.`, isError: true });
        } else {
          setFeedback({ message: `Booking ${currentId} updated to ${targetStatus}!`, isError: false });
          fetchData();
        }
      } catch (err) {
        setFeedback({ message: `Booking ${currentId} updated locally to ${targetStatus}!`, isError: false });
      }
    } else {
      setFeedback({ message: `Booking ${currentId} updated to ${targetStatus}!`, isError: false });
    }

    setViewingBooking(null);
    setModalStatus("");
    setModalRejectionReason("");
    setModalVoidReason("");
  };

  // Reschedule calculation helpers
  const rescheduleDays = useMemo(() => {
    if (!modalStartDate || !modalEndDate) return 1;
    const d1 = new Date(modalStartDate);
    const d2 = new Date(modalEndDate);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1;
    const diffTime = Math.max(0, d2 - d1);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(days, 1);
  }, [modalStartDate, modalEndDate]);

  const rescheduleAmount = useMemo(() => {
    const rate = viewingBooking?.dailyRate || 2800;
    return `₱${(rescheduleDays * rate).toLocaleString()}`;
  }, [rescheduleDays, viewingBooking]);

  // Dynamic confirmation label and style based on selected status
  const getConfirmationButtonDetails = () => {
    switch (modalStatus) {
      case "Approved":
        return {
          label: "Confirm Approval",
          bg: "#059669",
        };
      case "Rescheduled":
        return {
          label: "Confirm Reschedule",
          bg: "#7c3aed",
        };
      case "Rejected":
        return {
          label: "Confirm Rejection",
          bg: "#dc2626",
        };
      case "Voided":
        return {
          label: "Confirm Void",
          bg: "#991b1b",
        };
      case "Ongoing":
        return {
          label: "Confirm Ongoing",
          bg: "#0284c7",
        };
      case "Returned":
        return {
          label: "Confirm Return",
          bg: "#1e293b",
        };
      case "Pending":
        return {
          label: "Confirm Pending",
          bg: "#d97706",
        };
      default:
        return {
          label: "Save Changes",
          bg: "var(--wz-primary-red, #ff3b5c)",
        };
    }
  };

  // Add Booking Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [machineryUnits, setMachineryUnits] = useState([]);
  const [newBooking, setNewBooking] = useState({
    farmerName: "",
    farmerPhone: "",
    equipment: "John Deere 5075E Utility Tractor",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
    dailyRate: 2800,
    hasDriver: true,
  });

  // Fetch live applications and machinery units from backend
  const fetchData = async () => {
    try {
      const [appRes, machRes] = await Promise.all([
        api("/applications"),
        api("/machinery-units"),
      ]);

      if (appRes.ok && Array.isArray(appRes.data)) {
        setLiveBookings(appRes.data);
      }
      if (machRes.ok && Array.isArray(machRes.data)) {
        setMachineryUnits(machRes.data);
      }
    } catch (err) {
      console.error("Error loading bookings data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Format and merge live bookings with sample records
  const mergedBookings = useMemo(() => {
    const formattedLive = liveBookings.map((item, idx) => {
      // Calculate duration in days
      let days = 1;
      if (item.startDate && item.endDate) {
        const diffTime = Math.abs(new Date(item.endDate) - new Date(item.startDate));
        days = Math.max(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1, 1);
      }

      // Map status
      let displayStatus = "Pending";
      const s = (item.status || "").toLowerCase();
      if (item.cancellationRequested || s === "cancellation requested") displayStatus = "Cancellation Requested";
      else if (s === "approved") displayStatus = "Approved";
      else if (s === "checked-out") displayStatus = "Ongoing";
      else if (s === "returned") displayStatus = "Returned";
      else if (s === "cancelled" || s === "rejected") displayStatus = "Cancelled";
      else if (s === "pending") displayStatus = "Pending";

      // Detect category
      const eq = (item.equipment || "").toLowerCase();
      let cat = "Tractor";
      if (eq.includes("harvester")) cat = "Harvester";
      else if (eq.includes("baler")) cat = "Baler";
      else if (eq.includes("rake") || eq.includes("mower")) cat = "Mower / Rake";
      else if (eq.includes("sprayer")) cat = "Sprayer";
      else if (eq.includes("hauler") || eq.includes("truck")) cat = "Transport";

      const dailyRate = item.financials?.dailyRate || item.ratePerHectare || 2800;
      const totalAmount = item.totalAmount || item.financials?.totalPaid || dailyRate * days;

      const clientName = item.memberName || item.farmerName || item.memberEmail || "Member";
      const clientEmail = item.memberEmail || item.clientEmail || `${clientName.toLowerCase().replace(/\s+/g, ".")}@example.com`;
      const clientPhone = item.farmerPhone || item.memberPhone || item.clientPhone || item.phone || (idx % 2 === 0 ? "+63 917 123 4567" : "+63 928 234 5678");
      const clientAddress = item.memberAddress || item.clientAddress || "Kalilangan, Bukidnon";
      const clientAvatar = item.clientAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(clientName)}&background=0284c7&color=fff&bold=true`;
      const coopId = item.coopId || `COOP-MB-${String(item._id || idx).slice(-4).toUpperCase()}`;
      const receiptNo = item.receiptNo || (item._id ? `REC-${new Date().getFullYear()}-${String(item._id).slice(-4).toUpperCase()}` : `REC-2028-0${10 + idx}`);
      const paymentMethod = item.paymentMethod || "Cash";
      const cashPaymentOption = item.cashPaymentOption || (paymentMethod === "Cash" ? "Upon Pickup" : "");
      const gcashProof = item.gcashProof || null;
      const hectares = item.hectares || 1;
      const assignedDriver = item.assignedDriver || (idx % 2 === 0 ? "John Adams" : "Self-Operated");
      const hasDriver = Boolean(item.assignedDriver ? item.assignedDriver !== "Self-Operated" : idx % 2 === 0);

      return {
        id: item.displayId || `BK-WZ${1010 + idx}`,
        rawId: item._id || item.id,
        bookingDate: item.submittedAt
          ? new Date(item.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : (item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Aug 1, 2028"),
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        clientAvatar,
        coopId,
        receiptNo,
        paymentMethod,
        cashPaymentOption,
        gcashProof,
        hectares,
        dailyRate,
        daysCount: days,
        assignedDriver,
        machineryModel: item.equipment,
        category: cat,
        plan: item.hectares ? `${item.hectares} ha (${days}d)` : `${days} Day${days === 1 ? "" : "s"}`,
        dateRange: `${item.startDate} to ${item.endDate}`,
        hasDriver,
        paymentAmount: `₱${Number(totalAmount).toLocaleString()}`,
        paymentStatus: item.paymentStatus || (item.financials?.isSettled ? "Paid" : "Pending"),
        status: displayStatus,
        cancellationRequested: Boolean(item.cancellationRequested || s === "cancellation requested"),
        cancellationReason: item.cancellationReason || "",
        cancellationRequestedAt: item.cancellationRequestedAt || null,
        farmLocation: item.farmLocation || "",
        isLive: true,
      };
    });

    // If live bookings exist, prioritize them and supplement with mock rows
    const base = formattedLive.length > 0
      ? [...formattedLive, ...INITIAL_MOCK_BOOKINGS.slice(formattedLive.length)]
      : INITIAL_MOCK_BOOKINGS;

    return base
      .filter((b) => !deletedIds.includes(b.id))
      .map((b) => {
        const extra = bookingOverrides[b.id] || (b.rawId && bookingOverrides[b.rawId]) || {};
        const st = statusOverrides[b.id] || (b.rawId && statusOverrides[b.rawId]) || extra.status || b.status;
        return {
          ...b,
          ...extra,
          status: st,
        };
      });
  }, [liveBookings, statusOverrides, bookingOverrides, deletedIds]);

  // Filtered bookings based on search & dropdowns
  const filteredBookings = useMemo(() => {
    let result = mergedBookings.filter((b) => {
      // Search filter
      const matchesSearch =
        !searchQuery.trim() ||
        b.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.clientPhone && b.clientPhone.toLowerCase().includes(searchQuery.toLowerCase())) ||
        b.machineryModel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.category.toLowerCase().includes(searchQuery.toLowerCase());

      // Category filter
      const matchesType =
        filterType === "All" || b.category.toLowerCase().includes(filterType.toLowerCase());

      // Status filter
      const matchesStatus =
        filterStatus === "All" || b.status.toLowerCase() === filterStatus.toLowerCase();

      return matchesSearch && matchesType && matchesStatus;
    });

    result.sort((a, b) => {
      if (sortBy === "date_asc") return (a.startDate || "").localeCompare(b.startDate || "");
      if (sortBy === "date_desc") return (b.startDate || "").localeCompare(a.startDate || "");
      if (sortBy === "client_asc") return (a.clientName || "").localeCompare(b.clientName || "");
      if (sortBy === "client_desc") return (b.clientName || "").localeCompare(a.clientName || "");
      if (sortBy === "id_asc") return (a.id || "").localeCompare(b.id || "");
      return 0;
    });

    return result;
  }, [mergedBookings, searchQuery, filterType, filterStatus, sortBy]);

  // ================= Dynamic KPI Counts directly derived from Machinery Bookings =================
  // 1. Pending Bookings: Pending manager confirmation/review
  const pendingCount = useMemo(() => {
    return mergedBookings.filter((b) => (b.status || "").toLowerCase() === "pending").length;
  }, [mergedBookings]);

  // 2. Ongoing Bookings: Ongoing machinery rentals in the field
  const ongoingCount = useMemo(() => {
    return mergedBookings.filter((b) => (b.status || "").toLowerCase() === "ongoing").length;
  }, [mergedBookings]);

  // 3. Canceled Bookings: Cancelled and Rejected bookings (strictly excluding Void)
  const canceledCount = useMemo(() => {
    return mergedBookings.filter((b) => {
      const s = (b.status || "").toLowerCase();
      return (s === "cancelled" || s === "canceled" || s === "rejected") && s !== "void" && s !== "voided";
    }).length;
  }, [mergedBookings]);

  // 4. Completed Bookings: Returned or Completed
  const completedCount = useMemo(() => {
    return mergedBookings.filter((b) => {
      const s = (b.status || "").toLowerCase();
      return s === "returned" || s === "completed";
    }).length;
  }, [mergedBookings]);

  const totalBookingsCount = mergedBookings.length;

  // Dynamic KPI trend analysis (Increase, Decrease, or As Is) based on machinery bookings
  const kpiTrends = useMemo(() => {
    const computeForPredicate = (predicate) => {
      if (!mergedBookings || mergedBookings.length === 0) {
        return { direction: "as_is", pct: 0, text: "0% as is" };
      }
      // Sort chronologically (oldest first)
      const sorted = [...mergedBookings].sort((a, b) => {
        const da = new Date(a.bookingDate || a.startDate || 0).getTime();
        const db = new Date(b.bookingDate || b.startDate || 0).getTime();
        if (da !== db) return da - db;
        return (a.id || "").localeCompare(b.id || "");
      });

      const mid = Math.floor(sorted.length / 2);
      const priorList = sorted.slice(0, mid);
      const recentList = sorted.slice(mid);

      const prior = priorList.filter(predicate).length;
      const recent = recentList.filter(predicate).length;

      if (recent > prior) {
        const base = prior > 0 ? prior : 1;
        const pct = Math.round(((recent - prior) / base) * 100);
        return { direction: "increase", pct, text: `+${pct}% increase` };
      } else if (recent < prior) {
        const base = prior > 0 ? prior : 1;
        const pct = Math.round(((prior - recent) / base) * 100);
        return { direction: "decrease", pct, text: `-${pct}% decrease` };
      } else {
        return { direction: "as_is", pct: 0, text: "0% as is" };
      }
    };

    return {
      pending: computeForPredicate((b) => (b.status || "").toLowerCase() === "pending"),
      ongoing: computeForPredicate((b) => (b.status || "").toLowerCase() === "ongoing"),
      canceled: computeForPredicate((b) => {
        const s = (b.status || "").toLowerCase();
        return (s === "cancelled" || s === "canceled" || s === "rejected") && s !== "void" && s !== "voided";
      }),
      completed: computeForPredicate((b) => {
        const s = (b.status || "").toLowerCase();
        return s === "returned" || s === "completed";
      }),
    };
  }, [mergedBookings]);

  // Helper to render sparkline based on trend: "increase" | "decrease" | "as_is"
  const renderSparkline = (direction, color, id) => {
    const gradId = `sparkGrad_${id}`;
    if (direction === "increase") {
      return (
        <div className="wz-sparkline-container" title="Trending Up (Increase)">
          <svg width="96" height="48" viewBox="0 0 100 50">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 38 C 25 36, 45 28, 65 20 C 80 14, 90 12, 100 10 L 100 50 L 0 50 Z"
              fill={`url(#${gradId})`}
            />
            <path
              d="M 0 38 C 25 36, 45 28, 65 20 C 80 14, 90 12, 100 10"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    }
    if (direction === "decrease") {
      return (
        <div className="wz-sparkline-container" title="Trending Down (Decrease)">
          <svg width="96" height="48" viewBox="0 0 100 50">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 10 C 25 12, 45 22, 65 30 C 80 38, 90 40, 100 42 L 100 50 L 0 50 Z"
              fill={`url(#${gradId})`}
            />
            <path
              d="M 0 10 C 25 12, 45 22, 65 30 C 80 38, 90 40, 100 42"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    }
    // "as_is"
    return (
      <div className="wz-sparkline-container" title="Steady (As Is)">
        <svg width="96" height="48" viewBox="0 0 100 50">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 25 C 25 24, 50 26, 75 24 C 90 25, 95 25, 100 25 L 100 50 L 0 50 Z"
            fill={`url(#${gradId})`}
          />
          <path
            d="M 0 25 C 25 24, 50 26, 75 24 C 90 25, 95 25, 100 25"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  };

  // ================= Bookings Overview Chart Data (By Year [5 Years] or By Month) =================
  const chartData = useMemo(() => {
    const currentDone = completedCount + ongoingCount;
    const currentCanceled = canceledCount;

    if (chartPeriod === "By Month") {
      return [
        { label: "Jan", done: 65, canceled: 50, doneCount: 65, canceledCount: 50 },
        { label: "Feb", done: 70, canceled: 55, doneCount: 70, canceledCount: 55 },
        { label: "Mar", done: 85, canceled: 70, doneCount: 85, canceledCount: 70 },
        { label: "Apr", done: 80, canceled: 65, doneCount: 80, canceledCount: 65 },
        { label: "May", done: 75, canceled: 60, doneCount: 75, canceledCount: 60 },
        { label: "Jun", done: 95, canceled: 72, doneCount: 95, canceledCount: 72 },
        { label: "Jul", done: 82, canceled: 68, doneCount: 82, canceledCount: 68 },
        {
          label: "Aug",
          done: 70 + currentDone * 4,
          canceled: 50 + currentCanceled * 4,
          doneCount: currentDone,
          canceledCount: currentCanceled,
          highlighted: true,
        },
        { label: "Sep", done: 84, canceled: 70, doneCount: 84, canceledCount: 70 },
        { label: "Oct", done: 88, canceled: 75, doneCount: 88, canceledCount: 75 },
        { label: "Nov", done: 76, canceled: 62, doneCount: 76, canceledCount: 62 },
        { label: "Dec", done: 90, canceled: 78, doneCount: 90, canceledCount: 78 },
      ];
    }

    // Default: By Year (5 Years: 2024 to 2028)
    return [
      { label: "2024", done: 420, canceled: 45, doneCount: 420, canceledCount: 45 },
      { label: "2025", done: 580, canceled: 62, doneCount: 580, canceledCount: 62 },
      { label: "2026", done: 710, canceled: 70, doneCount: 710, canceledCount: 70 },
      { label: "2027", done: 840, canceled: 85, doneCount: 840, canceledCount: 85 },
      {
        label: "2028",
        done: 920 + currentDone * 5,
        canceled: 80 + currentCanceled * 5,
        doneCount: 920 + currentDone * 5,
        canceledCount: 80 + currentCanceled * 5,
        highlighted: true,
      },
    ];
  }, [chartPeriod, completedCount, ongoingCount, canceledCount]);

  // Handle status update (Approve / Reject / Change status)
  const handleUpdateStatus = async (bookingId, rawId, newStatus) => {
    setStatusOverrides((prev) => ({
      ...prev,
      [bookingId]: newStatus,
      ...(rawId ? { [rawId]: newStatus } : {}),
    }));

    // Update currently viewed booking if open so the modal updates immediately
    setViewingBooking((prev) =>
      prev && (prev.id === bookingId || prev.rawId === rawId)
        ? { ...prev, status: newStatus }
        : prev
    );

    if (rawId) {
      setFeedback({ message: `Updating booking to ${newStatus}...`, isError: false });
      try {
        const res = await api(`/applications/${rawId}`, {
          method: "PATCH",
          body: { status: newStatus },
        });
        if (!res.ok) {
          setFeedback({ message: res.data?.error || `Failed to update status.`, isError: true });
          return;
        }
        setFeedback({ message: `Booking marked as ${newStatus} successfully!`, isError: false });
        fetchData();
      } catch (err) {
        setFeedback({ message: `Booking ${bookingId} marked as ${newStatus} locally.`, isError: false });
      }
    } else {
      setFeedback({ message: `Booking ${bookingId} marked as ${newStatus}!`, isError: false });
    }
  };

  // Grant cancellation requested by member
  const handleGrantCancellation = async (rawId) => {
    if (!window.confirm("Grant member cancellation request? This will mark the booking as Cancelled, release the machinery unit, and notify the member.")) {
      return;
    }
    setFeedback({ message: "Granting cancellation request...", isError: false });
    try {
      const res = await api(`/applications/${rawId}/grant-cancellation`, { method: "POST" });
      if (res.ok) {
        setFeedback({ message: "Cancellation request granted. Booking marked as Cancelled.", isError: false });
        setViewingBooking(null);
        fetchData();
      } else {
        setFeedback({ message: res.data?.error || "Failed to grant cancellation.", isError: true });
      }
    } catch (err) {
      setFeedback({ message: "Error granting cancellation.", isError: true });
    }
  };

  // Decline cancellation requested by member
  const handleDeclineCancellation = async (rawId) => {
    if (!window.confirm("Decline member cancellation request? This will revert the booking to Approved status and notify the member.")) {
      return;
    }
    setFeedback({ message: "Declining cancellation request...", isError: false });
    try {
      const res = await api(`/applications/${rawId}/decline-cancellation`, { method: "POST" });
      if (res.ok) {
        setFeedback({ message: "Cancellation request declined. Booking reverted to Approved.", isError: false });
        setViewingBooking(null);
        fetchData();
      } else {
        setFeedback({ message: res.data?.error || "Failed to decline cancellation.", isError: true });
      }
    } catch (err) {
      setFeedback({ message: "Error declining cancellation.", isError: true });
    }
  };

  // Handle Delete Booking
  const handleDeleteBooking = (id) => {
    if (window.confirm(`Are you sure you want to delete booking ${id}?`)) {
      setDeletedIds((prev) => [...prev, id]);
      setFeedback({ message: `Booking ${id} deleted successfully.`, isError: false });
    }
  };

  // Handle Create Booking Submit
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!newBooking.farmerName.trim()) {
      alert("Please enter client/farmer name.");
      return;
    }

    try {
      const res = await api("/pos-booking", {
        method: "POST",
        body: {
          farmerName: newBooking.farmerName.trim(),
          farmerPhone: newBooking.farmerPhone.trim(),
          equipment: newBooking.equipment,
          startDate: newBooking.startDate,
          endDate: newBooking.endDate,
          rate: Number(newBooking.dailyRate) || 2800,
          rentalType: "day",
          paymentMethod: "Cash",
        },
      });

      if (res.ok) {
        setShowAddModal(false);
        setFeedback({ message: "New booking added successfully!", isError: false });
        setNewBooking({
          farmerName: "",
          farmerPhone: "",
          equipment: "John Deere 5075E Utility Tractor",
          startDate: new Date().toISOString().split("T")[0],
          endDate: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
          dailyRate: 2800,
          hasDriver: true,
        });
        fetchData();
      } else {
        alert(res.data?.error || "Failed to create booking.");
      }
    } catch (err) {
      alert("Error submitting booking.");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <ManagerSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top bar with Title & User Profile */}
        <ManagerTopbar title="Bookings" />

        {feedback.message && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              marginBottom: "18px",
              fontSize: "0.86rem",
              fontWeight: "600",
              background: feedback.isError ? "#fee2e2" : "#e0f2fe",
              color: feedback.isError ? "#991b1b" : "#0369a1",
              border: `1px solid ${feedback.isError ? "#fca5a5" : "#bae6fd"}`,
            }}
          >
            {feedback.message}
          </div>
        )}

        {/* ================= Top Row: 4 Metric Cards (2x2) + Bookings Overview Chart ================= */}
        <section className="wz-bookings-top-section">
          {/* Left Column: 2x2 KPI Cards */}
          <div className="wz-bookings-kpi-grid">
            {/* Card 1: Pending Bookings (Switched to First Position) */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-info">
                <div className="wz-kpi-header-row">
                  <div className="wz-kpi-small-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l3 3" />
                    </svg>
                  </div>
                  <span className="wz-kpi-title">Pending Bookings</span>
                </div>
                <div className="wz-kpi-big-num">{pendingCount}</div>
                <div>
                  {kpiTrends.pending.direction === "increase" && (
                    <span className="wz-trend-badge" style={{ background: "#fef3c7", color: "#b45309" }}>
                      ↑ {kpiTrends.pending.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#78350f", marginLeft: "4px" }}>
                        awaiting review
                      </span>
                    </span>
                  )}
                  {kpiTrends.pending.direction === "decrease" && (
                    <span className="wz-trend-badge wz-trend-positive">
                      ↓ {kpiTrends.pending.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#065f46", marginLeft: "4px" }}>
                        cleared
                      </span>
                    </span>
                  )}
                  {kpiTrends.pending.direction === "as_is" && (
                    <span className="wz-trend-badge wz-trend-neutral">
                      → {kpiTrends.pending.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#64748b", marginLeft: "4px" }}>
                        steady
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Data-driven Sparkline Graph (Increase, Decrease, or As Is) */}
              {renderSparkline(
                kpiTrends.pending.direction,
                kpiTrends.pending.direction === "increase"
                  ? "#f59e0b"
                  : kpiTrends.pending.direction === "decrease"
                  ? "#10b981"
                  : "#94a3b8",
                "pending"
              )}
            </div>

            {/* Card 2: Ongoing Bookings (Switched to Second Position) */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-info">
                <div className="wz-kpi-header-row">
                  <div className="wz-kpi-small-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <span className="wz-kpi-title">Ongoing Bookings</span>
                </div>
                <div className="wz-kpi-big-num">{ongoingCount}</div>
                <div>
                  {kpiTrends.ongoing.direction === "increase" && (
                    <span className="wz-trend-badge wz-trend-positive">
                      ↑ {kpiTrends.ongoing.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#64748b", marginLeft: "4px" }}>
                        in progress
                      </span>
                    </span>
                  )}
                  {kpiTrends.ongoing.direction === "decrease" && (
                    <span className="wz-trend-badge wz-trend-negative">
                      ↓ {kpiTrends.ongoing.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#991b1b", marginLeft: "4px" }}>
                        in progress
                      </span>
                    </span>
                  )}
                  {kpiTrends.ongoing.direction === "as_is" && (
                    <span className="wz-trend-badge wz-trend-neutral">
                      → {kpiTrends.ongoing.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#64748b", marginLeft: "4px" }}>
                        in progress
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Data-driven Sparkline Graph (Increase, Decrease, or As Is) */}
              {renderSparkline(
                kpiTrends.ongoing.direction,
                kpiTrends.ongoing.direction === "decrease" ? "#ef4444" : "#38bdf8",
                "ongoing"
              )}
            </div>

            {/* Card 3: Canceled Bookings (Includes Rejected, Strictly Excludes Void) */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-info">
                <div className="wz-kpi-header-row">
                  <div className="wz-kpi-small-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <span className="wz-kpi-title">Canceled Bookings</span>
                </div>
                <div className="wz-kpi-big-num">{canceledCount}</div>
                <div>
                  {kpiTrends.canceled.direction === "increase" && (
                    <span className="wz-trend-badge wz-trend-negative">
                      ↑ {kpiTrends.canceled.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#991b1b", marginLeft: "4px" }}>
                        canceled &amp; rejected
                      </span>
                    </span>
                  )}
                  {kpiTrends.canceled.direction === "decrease" && (
                    <span className="wz-trend-badge wz-trend-positive">
                      ↓ {kpiTrends.canceled.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#065f46", marginLeft: "4px" }}>
                        fewer cancels
                      </span>
                    </span>
                  )}
                  {kpiTrends.canceled.direction === "as_is" && (
                    <span className="wz-trend-badge wz-trend-neutral">
                      → {kpiTrends.canceled.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#64748b", marginLeft: "4px" }}>
                        canceled &amp; rejected
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Data-driven Sparkline Graph (Increase, Decrease, or As Is) */}
              {renderSparkline(
                kpiTrends.canceled.direction,
                kpiTrends.canceled.direction === "decrease" ? "#10b981" : "#ff3b5c",
                "canceled"
              )}
            </div>

            {/* Card 4: Completed Bookings */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-info">
                <div className="wz-kpi-header-row">
                  <div className="wz-kpi-small-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="9 12 12 15 16 10" />
                    </svg>
                  </div>
                  <span className="wz-kpi-title">Completed Bookings</span>
                </div>
                <div className="wz-kpi-big-num">{completedCount}</div>
                <div>
                  {kpiTrends.completed.direction === "increase" && (
                    <span className="wz-trend-badge wz-trend-positive">
                      ↑ {kpiTrends.completed.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#64748b", marginLeft: "4px" }}>
                        returned &amp; settled
                      </span>
                    </span>
                  )}
                  {kpiTrends.completed.direction === "decrease" && (
                    <span className="wz-trend-badge wz-trend-negative">
                      ↓ {kpiTrends.completed.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#991b1b", marginLeft: "4px" }}>
                        returned &amp; settled
                      </span>
                    </span>
                  )}
                  {kpiTrends.completed.direction === "as_is" && (
                    <span className="wz-trend-badge wz-trend-neutral">
                      → {kpiTrends.completed.text}{" "}
                      <span className="wz-trend-subtitle" style={{ color: "#64748b", marginLeft: "4px" }}>
                        returned &amp; settled
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Data-driven Sparkline Graph (Increase, Decrease, or As Is) */}
              {renderSparkline(
                kpiTrends.completed.direction,
                kpiTrends.completed.direction === "decrease" ? "#ef4444" : "#10b981",
                "completed"
              )}
            </div>
          </div>

          {/* Right Column: Bookings Overview Bidirectional Chart */}
          <div className="wz-overview-card">
            <div className="wz-overview-header">
              <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                <h3 className="wz-card-title">Bookings Overview</h3>
                <div className="wz-chart-legend">
                  <span className="wz-legend-pill">
                    <span className="wz-dot-done" /> Done
                  </span>
                  <span className="wz-legend-pill">
                    <span className="wz-dot-canceled" /> Canceled
                  </span>
                </div>

                {/* Clicked year/month stat pill */}
                {clickedItemIndex !== null && chartData[clickedItemIndex] ? (
                  <div className="wz-overview-clicked-pill">
                    <span style={{ color: "#475569", fontWeight: 600 }}>
                      {chartPeriod === "By Year"
                        ? `Year ${chartData[clickedItemIndex].label}: `
                        : `${chartData[clickedItemIndex].label}: `}
                    </span>
                    <span style={{ color: "var(--wz-primary-red)", fontWeight: 700 }}>
                      {chartData[clickedItemIndex].doneCount} done
                    </span>
                    <span style={{ color: "#94a3b8", margin: "0 2px" }}>,</span>
                    <span style={{ color: "var(--wz-primary-navy)", fontWeight: 700 }}>
                      {chartData[clickedItemIndex].canceledCount} cancel
                    </span>
                    <button
                      type="button"
                      className="wz-pill-close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClickedItemIndex(null);
                      }}
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                    (Click a column to view done &amp; cancel)
                  </span>
                )}
              </div>

              <select
                className="wz-dropdown-select"
                value={chartPeriod}
                onChange={(e) => {
                  const val = e.target.value;
                  setChartPeriod(val);
                  setClickedItemIndex(null); // Clear selection on period change
                }}
              >
                <option value="By Year">By Year (5 Years)</option>
                <option value="By Month">By Month</option>
              </select>
            </div>

            {/* Bidirectional Bars Chart */}
            <div className="wz-bidi-chart">
              {/* Y Axis Guide */}
              <div className="wz-chart-y-axis">
                <span>{chartPeriod === "By Month" ? "120" : "1,200"}</span>
                <span>{chartPeriod === "By Month" ? "60" : "600"}</span>
                <span style={{ color: "#475569" }}>0</span>
                <span>{chartPeriod === "By Month" ? "40" : "400"}</span>
                <span>{chartPeriod === "By Month" ? "80" : "800"}</span>
              </div>

              {/* Bars Grid */}
              <div
                className="wz-chart-bars-wrap"
                style={{ gridTemplateColumns: `repeat(${chartData.length}, 1fr)` }}
              >
                <div className="wz-chart-baseline" />

                {chartData.map((item, idx) => {
                  const isClicked = clickedItemIndex === idx;
                  const maxDone = Math.max(...chartData.map((d) => d.done || 1));
                  const maxCanceled = Math.max(...chartData.map((d) => d.canceled || 1));
                  const upperHeight = `${Math.min(((item.done || 10) / maxDone) * 44, 44)}px`;
                  const lowerHeight = `${Math.min(((item.canceled || 5) / maxCanceled) * 38, 38)}px`;
                  const barWidth = chartData.length <= 6 ? "22px" : "14px";

                  return (
                    <div
                      key={item.label}
                      className={`wz-month-col ${isClicked ? "active-month clicked-month" : ""}`}
                      onClick={() => setClickedItemIndex(clickedItemIndex === idx ? null : idx)}
                      style={{ cursor: "pointer" }}
                      title={`Click to view ${item.label} details`}
                    >
                      {/* Floating tooltip ONLY shown when clicked */}
                      {isClicked && (
                        <div className="wz-chart-tooltip wz-chart-tooltip-clicked" style={{ top: "-54px" }}>
                          <div className="wz-chart-tooltip-title">
                            {chartPeriod === "By Year" ? `Year ${item.label}` : `${item.label} Bookings`}
                          </div>
                          <div className="wz-chart-tooltip-summary" style={{ whiteSpace: "nowrap" }}>
                            <span style={{ color: "var(--wz-primary-red)" }}>{item.doneCount} done</span>,{" "}
                            <span style={{ color: "var(--wz-primary-navy)" }}>{item.canceledCount} cancel</span>
                          </div>
                        </div>
                      )}

                      {/* Upper Red Bar (Done) */}
                      <div
                        className="wz-bar-upper"
                        style={{ height: upperHeight, width: barWidth }}
                      />

                      {/* Lower Navy Bar (Canceled) */}
                      <div
                        className="wz-bar-lower"
                        style={{ height: lowerHeight, width: barWidth }}
                      />

                      {/* Label (e.g. 2024, 2025, 2026, 2027, 2028) */}
                      <span className="wz-month-label">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ================= Bottom Section: Machinery Bookings Table ================= */}
        <section className="wz-table-card">
          <div className="wz-table-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
            <div className="wz-toolbar-left" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <ManagerSearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search client, machinery, ID..."
                filters={[
                  {
                    id: "machineryType",
                    label: "Machinery Type",
                    value: filterType,
                    defaultValue: "All",
                    onChange: setFilterType,
                    options: [
                      { value: "All", label: "All Machinery Types" },
                      { value: "Tractor", label: "Tractor" },
                      { value: "Harvester", label: "Harvester" },
                      { value: "Baler", label: "Baler" },
                      { value: "Mower", label: "Mower / Rake" },
                      { value: "Sprayer", label: "Sprayer" },
                      { value: "Transport", label: "Transport" },
                    ],
                  },
                  {
                    id: "status",
                    label: "Status",
                    value: filterStatus,
                    defaultValue: "All",
                    onChange: setFilterStatus,
                    options: [
                      { value: "All", label: "All Statuses" },
                      { value: "Pending", label: "Pending" },
                      { value: "Approved", label: "Approved" },
                      { value: "Ongoing", label: "Ongoing" },
                      { value: "Returned", label: "Returned" },
                      { value: "Rescheduled", label: "Rescheduled" },
                      { value: "Rejected", label: "Rejected" },
                      { value: "Voided", label: "Voided" },
                      { value: "Cancelled", label: "Cancelled" },
                    ],
                  },
                ]}
                sort={{
                  value: sortBy,
                  defaultValue: "date_desc",
                  onChange: setSortBy,
                  options: [
                    { value: "date_desc", label: "Newest Date" },
                    { value: "date_asc", label: "Oldest Date" },
                    { value: "client_asc", label: "Client Name (A-Z)" },
                    { value: "client_desc", label: "Client Name (Z-A)" },
                    { value: "id_asc", label: "Booking ID" },
                  ],
                }}
              />
            </div>

            <div className="wz-toolbar-right" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Add Booking Action Button */}
              <button
                className="wz-btn-add-booking"
                onClick={() => setShowAddModal(true)}
              >
                + Add Booking
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="wz-table-responsive">
            <table className="wz-table wz-bookings-table">
              <thead>
                <tr>
                  <th>Status <span className="wz-sort-arrow">↕</span></th>
                  <th>Booking ID <span className="wz-sort-arrow">↕</span></th>
                  <th>Booking Date <span className="wz-sort-arrow">↕</span></th>
                  <th>Client Name <span className="wz-sort-arrow">↕</span></th>
                  <th>Phone Number <span className="wz-sort-arrow">↕</span></th>
                  <th>Machinery Model <span className="wz-sort-arrow">↕</span></th>
                  <th>Date <span className="wz-sort-arrow">↕</span></th>
                  <th>Payment <span className="wz-sort-arrow">↕</span></th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: "36px", textAlign: "center", color: "#64748b" }}>
                      No machinery bookings found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((b) => (
                    <tr key={b.id}>
                      {/* Status Pill (First Column - No Dot) */}
                      <td>
                        <span
                          className={`wz-status-pill wz-status-${b.status.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {b.status}
                        </span>
                      </td>

                      {/* Booking ID */}
                      <td className="wz-booking-id">{b.id}</td>

                      {/* Booking Date */}
                      <td style={{ color: "#64748b" }}>{b.bookingDate}</td>

                      {/* Client Name */}
                      <td className="wz-client-name">{b.clientName}</td>

                      {/* Client Phone Number */}
                      <td style={{ fontSize: "0.78rem", color: "#334155", fontWeight: 600 }}>
                        {b.clientPhone && b.clientPhone !== "—" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#16a34a", flexShrink: 0 }}>
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            <span>{b.clientPhone}</span>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>

                      {/* Machinery Model + Category Badge */}
                      <td>
                        <div className="wz-machinery-cell">
                          <span style={{ fontWeight: 600 }}>{b.machineryModel}</span>
                          <span className="wz-machinery-badge">{b.category}</span>
                        </div>
                      </td>

                      {/* Date Range */}
                      <td style={{ fontSize: "0.82rem", color: "#64748b" }}>{b.dateRange}</td>

                      {/* Payment */}
                      <td>
                        <div className="wz-payment-wrap">
                          <span className="wz-payment-amount">{b.paymentAmount}</span>
                          <span
                            className={
                              b.paymentStatus === "Paid"
                                ? "wz-payment-badge-paid"
                                : "wz-payment-badge-pending"
                            }
                          >
                            {b.paymentStatus}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, color: "#334155" }}>{b.paymentMethod || "Cash"}</span>
                          {b.paymentMethod === "Cash" && b.cashPaymentOption && (
                            <span style={{ color: "#0284c7", fontWeight: 600 }}>• {b.cashPaymentOption}</span>
                          )}
                          {b.paymentMethod === "GCash" && (
                            b.gcashProof ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewGcashImage(b.gcashProof);
                                }}
                                style={{
                                  background: "#ecfdf5",
                                  border: "1px solid #a7f3d0",
                                  borderRadius: "4px",
                                  padding: "1px 6px",
                                  color: "#047857",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                                title="Click to view member's uploaded GCash receipt screenshot"
                              >
                                📷 Proof Attached
                              </button>
                            ) : (
                              <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>• No proof yet</span>
                            )
                          )}
                        </div>
                      </td>

                      {/* Actions: ONLY 1 ICON ACTION BUTTON */}
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div className="wz-actions-cell" style={{ justifyContent: "center" }}>
                          <button
                            className="wz-action-icon-btn view"
                            onClick={() => handleOpenViewModal(b)}
                            title="Manage booking & view receipt"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination Controls */}
          <div className="wz-table-footer">
            <span>
              Showing {filteredBookings.length} of {mergedBookings.length} bookings
            </span>

            <div className="wz-pagination-btns">
              <button className="wz-page-btn" title="Previous Page">
                &lt;
              </button>
              <button className="wz-page-btn" title="Next Page">
                &gt;
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ================= Add Booking Modal ================= */}
      {showAddModal && (
        <div className="wz-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="wz-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                Add New Machinery Booking
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#94a3b8" }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateBooking}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                  Client / Farmer Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Juan Dela Cruz"
                  value={newBooking.farmerName}
                  onChange={(e) => setNewBooking({ ...newBooking, farmerName: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                  Contact Phone
                </label>
                <input
                  type="text"
                  placeholder="+63 917 000 0000"
                  value={newBooking.farmerPhone}
                  onChange={(e) => setNewBooking({ ...newBooking, farmerPhone: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                  Machinery Equipment
                </label>
                <select
                  value={newBooking.equipment}
                  onChange={(e) => setNewBooking({ ...newBooking, equipment: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem", background: "#fff" }}
                >
                  {machineryUnits.length > 0 ? (
                    machineryUnits.map((u) => (
                      <option key={u.unitId || u._id} value={u.name}>
                        {u.name} ({u.category}) - ₱{u.ratePerDay}/day
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="John Deere 5075E Utility Tractor">John Deere 5075E Utility Tractor (₱2,800/day)</option>
                      <option value="Kubota DC-70 Plus Combine Harvester">Kubota DC-70 Plus Combine Harvester (₱5,500/day)</option>
                      <option value="New Holland Roll-Belt 450 Round Baler">New Holland Roll-Belt 450 Round Baler (₱3,200/day)</option>
                      <option value="Case IH Farmall 90JX 4WD Tractor">Case IH Farmall 90JX 4WD Tractor (₱3,600/day)</option>
                    </>
                  )}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newBooking.startDate}
                    onChange={(e) => setNewBooking({ ...newBooking, startDate: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newBooking.endDate}
                    onChange={(e) => setNewBooking({ ...newBooking, endDate: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "10px", marginBottom: "18px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Daily Rate (₱ PHP)
                  </label>
                  <input
                    type="number"
                    value={newBooking.dailyRate}
                    onChange={(e) => setNewBooking({ ...newBooking, dailyRate: Number(e.target.value) })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Assigned Operator
                  </label>
                  <select
                    value={newBooking.hasDriver ? "yes" : "no"}
                    onChange={(e) => setNewBooking({ ...newBooking, hasDriver: e.target.value === "yes" })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem", background: "#fff" }}
                  >
                    <option value="yes">With Driver</option>
                    <option value="no">Self-Operated</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#475569",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "9px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--wz-primary-red)",
                    color: "#fff",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Save Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ================= MODAL: VIEW BOOKING, RECEIPT & PROFILE DETAILS ================= */}
      {viewingBooking && (
        <div
          className="wz-booking-modal-overlay"
          onClick={handleCloseViewModal}
        >
          <div
            className="wz-booking-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="wz-booking-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div>
                  <span style={{ fontSize: "0.72rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Machinery Booking & Receipt Details
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "2px" }}>
                    <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                      {viewingBooking.id}
                    </h3>
                    <span
                      className={`wz-status-pill wz-status-${viewingBooking.status.toLowerCase()}`}
                      style={{ fontSize: "0.74rem" }}
                    >
                      {viewingBooking.status}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleCloseViewModal}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1rem",
                  cursor: "pointer",
                  color: "#64748b",
                  transition: "all 0.15s ease",
                }}
                title="Close without saving"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="wz-booking-modal-body">
              {/* 1. Client Profile Card */}
              <div className="wz-modal-client-card">
                <img
                  src={
                    viewingBooking.clientAvatar ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(viewingBooking.clientName)}&background=0284c7&color=fff&bold=true`
                  }
                  alt={viewingBooking.clientName}
                  className="wz-modal-client-avatar"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(viewingBooking.clientName)}&background=0284c7&color=fff&bold=true`;
                  }}
                />
                <div className="wz-modal-client-meta">
                  <div className="wz-modal-client-name-row">
                    <h4 className="wz-modal-client-name">{viewingBooking.clientName}</h4>
                    <span className="wz-modal-coop-badge">
                      {viewingBooking.coopId || "COOP MEMBER"}
                    </span>
                  </div>
                  <div className="wz-modal-contact-grid">
                    <div className="wz-modal-contact-item" title={viewingBooking.clientEmail}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      <span>{viewingBooking.clientEmail || "client@example.com"}</span>
                    </div>
                    <div className="wz-modal-contact-item" title={viewingBooking.clientPhone}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span>{viewingBooking.clientPhone || "+63 917 123 4567"}</span>
                    </div>
                    <div className="wz-modal-contact-item" style={{ gridColumn: "1 / -1" }} title={viewingBooking.clientAddress}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>{viewingBooking.clientAddress || "Malaybalay City, Bukidnon"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cancellation Requested Alert & Actions */}
              {(viewingBooking.status === "Cancellation Requested" || viewingBooking.cancellationRequested) && (
                <div
                  style={{
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    borderRadius: "10px",
                    padding: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                      <strong style={{ color: "#9f1239", fontSize: "0.95rem" }}>
                        Member Requested Booking Cancellation
                      </strong>
                    </div>
                    {viewingBooking.cancellationRequestedAt && (
                      <span style={{ fontSize: "0.76rem", color: "#9f1239" }}>
                        Requested {new Date(viewingBooking.cancellationRequestedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "8px 0 14px", fontSize: "0.85rem", color: "#881337" }}>
                    <strong>Reason given:</strong>{" "}
                    {viewingBooking.cancellationReason || "Member requested cancellation through the member portal."}
                  </p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleGrantCancellation(viewingBooking.rawId || viewingBooking.id)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "none",
                        background: "#dc2626",
                        color: "#ffffff",
                        fontWeight: "600",
                        fontSize: "0.84rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Grant Cancellation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineCancellation(viewingBooking.rawId || viewingBooking.id)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        color: "#334155",
                        fontWeight: "600",
                        fontSize: "0.84rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Decline Request (Keep Approved)
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Status Selector (No color, staging only until Save is clicked) */}
              <div className="wz-status-changer-box">
                <div className="wz-status-changer-header">
                  <span className="wz-status-changer-title">Change Booking Status</span>
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    Selected: <strong style={{ color: "#0f172a" }}>{modalStatus}</strong>
                    {modalStatus !== viewingBooking.status && (
                      <span style={{ marginLeft: "6px", color: "#64748b", fontStyle: "italic", fontSize: "0.74rem" }}>
                        (Unsaved)
                      </span>
                    )}
                  </span>
                </div>
                <div className="wz-status-btn-group">
                  {["Pending", "Approved", "Ongoing", "Returned", "Rescheduled", "Rejected", "Voided"].map((s) => {
                    const isSelected = modalStatus.toLowerCase() === s.toLowerCase();
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`wz-status-switch-btn ${isSelected ? "active" : ""}`}
                        onClick={() => setModalStatus(s)}
                        title={`Select status ${s}`}
                      >
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Subpanel: Reason for Rejection */}
                {modalStatus === "Rejected" && (
                  <div className="wz-modal-subpanel">
                    <div className="wz-subpanel-title">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Specify Reason for Rejection:
                    </div>

                    <div className="wz-quick-preset-chips">
                      {[
                        "Machinery Under Maintenance",
                        "Schedule Conflict / Unavailable",
                        "Incomplete Documentation",
                        "Operator Unavailable",
                        "Adverse Weather Conditions",
                        "Member Requested Cancellation",
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`wz-preset-chip ${modalRejectionReason === preset ? "active" : ""}`}
                          onClick={() => setModalRejectionReason(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <textarea
                      className="wz-modal-textarea"
                      placeholder="Type or select a reason for rejecting this booking..."
                      value={modalRejectionReason}
                      onChange={(e) => setModalRejectionReason(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}

                {/* Subpanel: Reschedule Dates */}
                {modalStatus === "Rescheduled" && (
                  <div className="wz-modal-subpanel">
                    <div className="wz-subpanel-title">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <circle cx="12" cy="15" r="2" />
                      </svg>
                      Select New Booking Schedule Dates:
                    </div>

                    <div className="wz-modal-date-grid">
                      <div className="wz-modal-date-field">
                        <label className="wz-modal-date-label">New Start Date</label>
                        <input
                          type="date"
                          className="wz-modal-date-input"
                          value={modalStartDate}
                          onChange={(e) => setModalStartDate(e.target.value)}
                        />
                      </div>
                      <div className="wz-modal-date-field">
                        <label className="wz-modal-date-label">New End Date</label>
                        <input
                          type="date"
                          className="wz-modal-date-input"
                          value={modalEndDate}
                          min={modalStartDate}
                          onChange={(e) => setModalEndDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="wz-reschedule-calc-badge">
                      <span>
                        Updated Duration: <strong>{rescheduleDays} Day{rescheduleDays === 1 ? "" : "s"}</strong>
                      </span>
                      <span>
                        Recalculated Total: <strong style={{ color: "var(--wz-primary-red)" }}>{rescheduleAmount}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Subpanel: Void Booking */}
                {modalStatus === "Voided" && (
                  <div className="wz-modal-subpanel">
                    <div className="wz-void-notice-banner">
                      ⚠️ <strong>Void Warning:</strong> Voiding will permanently invalidate this machinery rental transaction, cancel driver assignments, and release the unit for other cooperative members.
                    </div>

                    <div className="wz-subpanel-title">
                      Reason for Voiding:
                    </div>

                    <div className="wz-quick-preset-chips">
                      {[
                        "Administrative Cancellation",
                        "Duplicate Billing Entry",
                        "Member Clerical Error",
                        "Equipment Decommissioned",
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`wz-preset-chip ${modalVoidReason === preset ? "active" : ""}`}
                          onClick={() => setModalVoidReason(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <textarea
                      className="wz-modal-textarea"
                      placeholder="Type or select reason for voiding..."
                      value={modalVoidReason}
                      onChange={(e) => setModalVoidReason(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {/* 3. Machinery & Schedule Details */}
              <div className="wz-modal-summary-grid">
                <div className="wz-modal-summary-item">
                  <div className="wz-modal-summary-label">Machinery Equipment</div>
                  <div className="wz-modal-summary-value">{viewingBooking.machineryModel}</div>
                  <span className="wz-machinery-badge" style={{ marginTop: "4px", display: "inline-block" }}>
                    {viewingBooking.category}
                  </span>
                </div>
                <div className="wz-modal-summary-item">
                  <div className="wz-modal-summary-label">Rental Duration</div>
                  <div className="wz-modal-summary-value">{viewingBooking.plan}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                    {viewingBooking.dateRange}
                  </div>
                </div>
                <div className="wz-modal-summary-item">
                  <div className="wz-modal-summary-label">Assigned Operator / Driver</div>
                  <div className="wz-modal-summary-value">
                    {viewingBooking.hasDriver
                      ? viewingBooking.assignedDriver || "Driver Assigned"
                      : "Self-Operated (No Driver)"}
                  </div>
                </div>
                <div className="wz-modal-summary-item">
                  <div className="wz-modal-summary-label">Booking Placed Date</div>
                  <div className="wz-modal-summary-value">{viewingBooking.bookingDate}</div>
                </div>
              </div>

              {/* 4. Payment Verification & Proof Card */}
              <div
                style={{
                  background: viewingBooking.paymentStatus === "Paid" ? "#f0fdf4" : "#fffbeb",
                  border: `1px solid ${viewingBooking.paymentStatus === "Paid" ? "#bbf7d0" : "#fef3c7"}`,
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1.2rem" }}>
                      {viewingBooking.paymentMethod === "GCash" ? "📱" : "💵"}
                    </span>
                    <div>
                      <strong style={{ fontSize: "0.92rem", color: "#0f172a" }}>
                        Payment Method: {viewingBooking.paymentMethod || "Cash"}
                      </strong>
                      <div style={{ fontSize: "0.76rem", color: "#475569" }}>
                        {viewingBooking.paymentMethod === "Cash" && (
                          <span>Option: <strong>{viewingBooking.cashPaymentOption === "Upon Return" ? "Pay upon returning machinery" : "Pay upon pickup / dispatch"}</strong></span>
                        )}
                        {viewingBooking.paymentMethod === "GCash" && (
                          <span>KIMPC GCash: <strong>0926 463 8983</strong> (Kalilangan Irrigators MPC)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      className={viewingBooking.paymentStatus === "Paid" ? "wz-payment-badge-paid" : "wz-payment-badge-pending"}
                      style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                    >
                      Payment: {viewingBooking.paymentStatus}
                    </span>

                    {viewingBooking.paymentStatus !== "Paid" && (
                      <button
                        type="button"
                        onClick={() => handleSettlePayment(viewingBooking)}
                        style={{
                          background: "#059669",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          padding: "6px 14px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)",
                        }}
                        title="Verify payment and issue official receipt"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Confirm &amp; Settle Payment
                      </button>
                    )}
                  </div>
                </div>

                {/* GCash Screenshot Preview */}
                {viewingBooking.paymentMethod === "GCash" && (
                  <div style={{ marginTop: "12px", borderTop: "1px dashed #e2e8f0", paddingTop: "12px" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "6px" }}>
                      GCash Payment Screenshot Proof:
                    </span>
                    {viewingBooking.gcashProof ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <img
                          src={viewingBooking.gcashProof}
                          alt="GCash Payment Proof"
                          onClick={() => setPreviewGcashImage(viewingBooking.gcashProof)}
                          style={{
                            width: "80px",
                            height: "80px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            border: "2px solid #059669",
                            cursor: "pointer",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                          }}
                          title="Click to zoom in on proof screenshot"
                        />
                        <div>
                          <p style={{ margin: "0 0 4px", fontSize: "0.8rem", color: "#065f46", fontWeight: 600 }}>
                            ✓ Screenshot uploaded by member
                          </p>
                          <button
                            type="button"
                            onClick={() => setPreviewGcashImage(viewingBooking.gcashProof)}
                            style={{
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: "6px",
                              padding: "4px 10px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "#334155",
                              cursor: "pointer",
                            }}
                          >
                            🔍 Click to Enlarge Screenshot
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.78rem", color: "#b45309", background: "#fef3c7", padding: "8px 12px", borderRadius: "6px" }}>
                        ⚠️ Member has not uploaded a GCash transaction screenshot yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Official Machine Rental Receipt / Voucher */}
              <div className="wz-receipt-voucher">
                <div className="wz-receipt-header">
                  <div>
                    <h5 className="wz-receipt-coop-name">KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE (KIMPC)</h5>
                    <p className="wz-receipt-sub">Official Machinery Rental Billing Voucher &amp; Settlement</p>
                  </div>
                  <div className="wz-receipt-num-box">
                    <div className="wz-receipt-num-label">Receipt No.</div>
                    <div className="wz-receipt-num">{viewingBooking.receiptNo || "REC-2028-0001"}</div>
                  </div>
                </div>

                {/* Status Notice Banners on Receipt */}
                {(viewingBooking.status === "Rejected" || modalStatus === "Rejected") && (
                  <div style={{ marginBottom: "12px", padding: "8px 12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", fontSize: "0.78rem", color: "#991b1b" }}>
                    <strong>⛔ Reason for Rejection:</strong> {modalRejectionReason || viewingBooking.rejectionReason || "No reason specified"}
                  </div>
                )}
                {(viewingBooking.status === "Voided" || modalStatus === "Voided") && (
                  <div style={{ marginBottom: "12px", padding: "8px 12px", background: "#f1f5f9", border: "1px dashed #cbd5e1", borderRadius: "8px", fontSize: "0.78rem", color: "#475569" }}>
                    <strong>🚫 Booking Voided:</strong> {modalVoidReason || viewingBooking.voidReason || "Administrative Cancellation"}
                  </div>
                )}
                {(viewingBooking.status === "Rescheduled" || modalStatus === "Rescheduled") && (
                  <div style={{ marginBottom: "12px", padding: "8px 12px", background: "#f3e8ff", border: "1px solid #d8b4fe", borderRadius: "8px", fontSize: "0.78rem", color: "#6b21a8" }}>
                    <strong>🔄 Rescheduled Schedule:</strong> {modalStartDate && modalEndDate ? `${modalStartDate} to ${modalEndDate}` : viewingBooking.dateRange} ({rescheduleDays} Days)
                  </div>
                )}

                <table className="wz-receipt-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Terms / Days</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>{viewingBooking.machineryModel}</strong>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                          Daily Rate: ₱{Number(viewingBooking.dailyRate || 2800).toLocaleString()} / day
                        </div>
                      </td>
                      <td>{viewingBooking.plan}</td>
                      <td style={{ textAlign: "right", fontWeight: "600" }}>{viewingBooking.paymentAmount}</td>
                    </tr>
                    <tr>
                      <td>
                        Assigned Operator Service
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                          {viewingBooking.hasDriver ? (viewingBooking.assignedDriver || "Coop Operator") : "Self-Operated by Member"}
                        </div>
                      </td>
                      <td>{viewingBooking.hasDriver ? "Included" : "N/A"}</td>
                      <td style={{ textAlign: "right", color: "#059669" }}>₱0.00</td>
                    </tr>
                    <tr>
                      <td>Coop Maintenance & Insurance Guarantee</td>
                      <td>Coop Benefit</td>
                      <td style={{ textAlign: "right", color: "#059669" }}>₱0.00</td>
                    </tr>
                    <tr>
                      <td>CDA RA 9520 Member Tax Exemption</td>
                      <td>Tax Exempt</td>
                      <td style={{ textAlign: "right", color: "#059669" }}>₱0.00</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2">Total Amount Payable:</td>
                      <td style={{ textAlign: "right", color: "var(--wz-primary-red)" }}>
                        {viewingBooking.paymentAmount}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div className="wz-receipt-footer-strip">
                  <div>
                    <span>Payment Method: </span>
                    <strong style={{ color: "#0f172a" }}>{viewingBooking.paymentMethod || "Cash"}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Payment Status: </span>
                    <span className={viewingBooking.paymentStatus === "Paid" ? "wz-payment-badge-paid" : "wz-payment-badge-pending"}>
                      {viewingBooking.paymentStatus}
                    </span>
                  </div>
                  <div style={{ width: "100%", fontSize: "0.7rem", color: "#94a3b8", textAlign: "right", marginTop: "4px" }}>
                    ✓ Authorized by KIMPC Cooperative Fleet Dispatch • Digitally Verified
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer: Save and Close */}
            <div className="wz-booking-modal-footer">
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontWeight: "600",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Receipt
              </button>

              <div className="wz-modal-footer-actions">
                <button
                  type="button"
                  className="wz-modal-btn-close"
                  onClick={handleCloseViewModal}
                  title="Discard changes and close"
                >
                  Close
                </button>
                <button
                  type="button"
                  className="wz-modal-btn-save"
                  style={{
                    backgroundColor: getConfirmationButtonDetails().bg,
                  }}
                  onClick={handleSaveModalStatus}
                  title={`${getConfirmationButtonDetails().label} for booking ${viewingBooking?.id || ""}`}
                >
                  {modalStatus === "Approved" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {modalStatus === "Rescheduled" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  )}
                  {modalStatus === "Rejected" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                  {modalStatus === "Voided" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                  )}
                  {modalStatus !== "Approved" && modalStatus !== "Rescheduled" && modalStatus !== "Rejected" && modalStatus !== "Voided" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {getConfirmationButtonDetails().label}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* GCash Screenshot Lightbox Modal */}
      {previewGcashImage && (
        <div
          className="wz-booking-modal-overlay"
          style={{ zIndex: 10000, background: "rgba(15, 23, 42, 0.85)" }}
          onClick={() => setPreviewGcashImage(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "20px",
              maxWidth: "520px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              textAlign: "center",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>📱</span>
                <strong style={{ fontSize: "1rem", color: "#0f172a" }}>GCash Payment Proof Screenshot</strong>
              </div>
              <button
                type="button"
                onClick={() => setPreviewGcashImage(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  color: "#64748b",
                }}
              >
                ✕
              </button>
            </div>
            <img
              src={previewGcashImage}
              alt="Uploaded GCash Screenshot"
              style={{
                width: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
              }}
            />
            <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPreviewGcashImage(null)}
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  fontWeight: 600,
                  fontSize: "0.84rem",
                  cursor: "pointer",
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
