import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, getCachedApiData } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

// Initial drivers list modeled for KIMPC
const INITIAL_DRIVERS = [
  {
    id: "d1",
    name: "John Adams",
    email: "john.adams@example.com",
    phone: "111-222-3333",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    address: "742 Evergreen Terrace",
    workHours: 232,
    performance: 4.6,
    performanceLabel: "Excellent",
    dutyDays: [2, 3, 7, 9, 10, 14, 15, 19, 21, 22, 29],
    schedule: [
      { date: "Tue, 1 Aug", client: "Alice Johnson", time: "10:00 AM", vehicle: "Toyota Corolla" },
      { date: "Wed, 2 Aug", client: "Michael Brown", time: "08:00 AM", vehicle: "Ford Focus" },
      { date: "Fri, 4 Aug", client: "Nancy Davis", time: "09:00 AM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d2",
    name: "Emily Brown",
    email: "emily.brown@example.com",
    phone: "222-333-4444",
    status: "Sick Leave",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    address: "512 Pinecrest Blvd",
    workHours: 198,
    performance: 4.4,
    performanceLabel: "Good",
    dutyDays: [4, 5, 11, 12, 18, 25, 26],
    schedule: [
      { date: "Mon, 14 Aug", client: "Jane Wilson", time: "01:30 PM", vehicle: "Hyundai Elantra" },
    ],
  },
  {
    id: "d3",
    name: "Michael Clark",
    email: "michael.clark@example.com",
    phone: "333-444-5555",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    address: "88 Market St, Suite 4B",
    workHours: 254,
    performance: 4.8,
    performanceLabel: "Excellent",
    dutyDays: [1, 3, 5, 8, 10, 12, 15, 17, 22, 24, 29],
    schedule: [
      { date: "Wed, 2 Aug", client: "Oliver Scott", time: "08:00 AM", vehicle: "Kia Soul" },
      { date: "Thu, 3 Aug", client: "Charlie Davis", time: "09:30 AM", vehicle: "BMW X5" },
    ],
  },
  {
    id: "d4",
    name: "Sarah Davis",
    email: "sarah.davis@example.com",
    phone: "444-555-6666",
    status: "Half-Day Leave",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    address: "204 Oak Ridge Way",
    workHours: 210,
    performance: 4.3,
    performanceLabel: "Good",
    dutyDays: [1, 2, 7, 8, 14, 15, 21, 22, 28],
    schedule: [
      { date: "Fri, 4 Aug", client: "Diana White", time: "04:30 PM", vehicle: "Kia Soul" },
    ],
  },
  {
    id: "d5",
    name: "James Evans",
    email: "james.evans@example.com",
    phone: "555-666-7777",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80",
    address: "310 Meadow Lane",
    workHours: 242,
    performance: 4.7,
    performanceLabel: "Excellent",
    dutyDays: [2, 3, 4, 9, 10, 11, 16, 17, 18, 23, 24],
    schedule: [
      { date: "Sat, 5 Aug", client: "George Clark", time: "02:00 PM", vehicle: "Hyundai Elantra" },
    ],
  },
  {
    id: "d6",
    name: "Laura Fisher",
    email: "laura.fisher@example.com",
    phone: "666-777-8888",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    address: "95 Westwood Blvd",
    workHours: 236,
    performance: 4.5,
    performanceLabel: "Excellent",
    dutyDays: [1, 2, 6, 8, 9, 13, 14, 18, 20, 21, 28],
    schedule: [
      { date: "Tue, 8 Aug", client: "Helen Martinez", time: "01:00 PM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d7",
    name: "Robert Gray",
    email: "robert.gray@example.com",
    phone: "777-888-9999",
    status: "Sick Leave",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80",
    address: "109 Lakeview Court",
    workHours: 180,
    performance: 4.2,
    performanceLabel: "Good",
    dutyDays: [5, 6, 12, 13, 19, 20, 26, 27],
    schedule: [
      { date: "Thu, 17 Aug", client: "Kyle Thompson", time: "12:30 PM", vehicle: "Audi Q7" },
    ],
  },
  {
    id: "d8",
    name: "Jessica Harris",
    email: "jessica.harris@example.com",
    phone: "888-999-0000",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80",
    address: "420 Maple Drive",
    workHours: 245,
    performance: 4.6,
    performanceLabel: "Excellent",
    dutyDays: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21],
    schedule: [
      { date: "Fri, 18 Aug", client: "Nancy Davis", time: "09:00 AM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d9",
    name: "Daniel Jackson", // DEFAULT SELECTED IN SCREENSHOT
    email: "daniel.jackson@example.com",
    phone: "999-000-1111",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80",
    address: "123 Elm Street",
    workHours: 248,
    performance: 4.5,
    performanceLabel: "Excellent",
    dutyDays: [1, 2, 6, 8, 9, 13, 14, 18, 20, 21, 28],
    schedule: [
      { date: "Tue, 1 Aug", client: "Alice Johnson", time: "10:00 AM", vehicle: "Toyota Corolla" },
      { date: "Thu, 3 Aug", client: "Bob Smith", time: "11:30 AM", vehicle: "Honda Civic" },
      { date: "Mon, 7 Aug", client: "Charlie Davis", time: "2:00 PM", vehicle: "Ford Focus" },
      { date: "Thu, 10 Aug", client: "Diana White", time: "1:00 PM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d10",
    name: "Olivia King",
    email: "olivia.king@example.com",
    phone: "000-111-2222",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    address: "67 Beacon Street",
    workHours: 228,
    performance: 4.6,
    performanceLabel: "Excellent",
    dutyDays: [3, 4, 10, 11, 17, 18, 24, 25],
    schedule: [
      { date: "Sat, 12 Aug", client: "Michael Brown", time: "01:00 PM", vehicle: "Toyota Corolla" },
    ],
  },
  {
    id: "d11",
    name: "David Lee",
    email: "david.lee@example.com",
    phone: "111-222-3334",
    status: "Half-Day Leave",
    avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80",
    address: "802 Highland Ave",
    workHours: 204,
    performance: 4.3,
    performanceLabel: "Good",
    dutyDays: [2, 4, 8, 10, 15, 17, 22, 24, 29],
    schedule: [
      { date: "Thu, 17 Aug", client: "Oliver Scott", time: "11:00 AM", vehicle: "Nissan Altima" },
    ],
  },
];

const CURRENT_YEAR = new Date().getFullYear();

// Initial machinery bookings assigned to drivers in KIMPC
const DEFAULT_DRIVER_BOOKINGS = [
  {
    id: "BK-WZ1001",
    assignedDriver: "John Adams",
    machineryModel: "John Deere 5075E",
    category: "Tractor",
    startDate: `${CURRENT_YEAR}-08-01`,
    endDate: `${CURRENT_YEAR}-08-05`,
    dateRange: `Aug 1, ${CURRENT_YEAR} to Aug 5, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Alice Johnson",
    farmLocation: "Malaybalay City, Bukidnon",
  },
  {
    id: "BK-WZ1002",
    assignedDriver: "Daniel Jackson",
    machineryModel: "Kubota DC-70 Plus",
    category: "Harvester",
    startDate: `${CURRENT_YEAR}-08-01`,
    endDate: `${CURRENT_YEAR}-08-08`,
    dateRange: `Aug 1, ${CURRENT_YEAR} to Aug 8, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Bob Smith",
    farmLocation: "Maramag, Bukidnon",
  },
  {
    id: "BK-WZ1003",
    assignedDriver: "Michael Clark",
    machineryModel: "New Holland Roll-Belt 450",
    category: "Baler",
    startDate: `${CURRENT_YEAR}-08-02`,
    endDate: `${CURRENT_YEAR}-08-10`,
    dateRange: `Aug 2, ${CURRENT_YEAR} to Aug 10, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Charlie Davis",
    farmLocation: "Valencia City, Bukidnon",
  },
  {
    id: "BK-WZ1004",
    assignedDriver: "James Evans",
    machineryModel: "Case IH Farmall 90JX",
    category: "Tractor",
    startDate: `${CURRENT_YEAR}-08-02`,
    endDate: `${CURRENT_YEAR}-08-06`,
    dateRange: `Aug 2, ${CURRENT_YEAR} to Aug 6, ${CURRENT_YEAR}`,
    status: "Returned",
    clientName: "Diana White",
    farmLocation: "Manolo Fortich, Bukidnon",
  },
  {
    id: "BK-WZ1005",
    assignedDriver: "Sarah Davis",
    machineryModel: "Kuhn GA 4121 GM",
    category: "Mower / Rake",
    startDate: `${CURRENT_YEAR}-08-03`,
    endDate: `${CURRENT_YEAR}-08-07`,
    dateRange: `Aug 3, ${CURRENT_YEAR} to Aug 7, ${CURRENT_YEAR}`,
    status: "Cancelled",
    clientName: "Edward Green",
    farmLocation: "Quezon, Bukidnon",
  },
  {
    id: "BK-WZ1006",
    assignedDriver: "John Adams",
    machineryModel: "Ag Leader Precision Boom Sprayer",
    category: "Sprayer",
    startDate: `${CURRENT_YEAR}-09-03`,
    endDate: `${CURRENT_YEAR}-09-18`,
    dateRange: `Sep 3, ${CURRENT_YEAR} to Sep 18, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Fiona Brown",
    farmLocation: "Don Carlos, Bukidnon",
  },
  {
    id: "BK-WZ1007",
    assignedDriver: "Daniel Jackson",
    machineryModel: "Isuzu Forward Flatbed Hauler",
    category: "Transport",
    startDate: `${CURRENT_YEAR}-08-14`,
    endDate: `${CURRENT_YEAR}-08-18`,
    dateRange: `Aug 14, ${CURRENT_YEAR} to Aug 18, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "George Clark",
    farmLocation: "Impasug-ong, Bukidnon",
  },
  {
    id: "BK-WZ1008",
    assignedDriver: "Michael Clark",
    machineryModel: "John Deere 5075E",
    category: "Tractor",
    startDate: `${CURRENT_YEAR}-08-20`,
    endDate: `${CURRENT_YEAR}-08-25`,
    dateRange: `Aug 20, ${CURRENT_YEAR} to Aug 25, ${CURRENT_YEAR}`,
    status: "Approved",
    clientName: "Helen Martinez",
    farmLocation: "San Fernando, Bukidnon",
  },
  {
    id: "BK-WZ1009",
    assignedDriver: "Emily Brown",
    machineryModel: "Kubota DC-70 Plus",
    category: "Harvester",
    startDate: `${CURRENT_YEAR}-08-10`,
    endDate: `${CURRENT_YEAR}-08-15`,
    dateRange: `Aug 10, ${CURRENT_YEAR} to Aug 15, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Ivan Rodriguez",
    farmLocation: "Kibawe, Bukidnon",
  },
  {
    id: "BK-WZ1010",
    assignedDriver: "Laura Fisher",
    machineryModel: "Ag Leader Precision Boom Sprayer",
    category: "Sprayer",
    startDate: `${CURRENT_YEAR}-08-08`,
    endDate: `${CURRENT_YEAR}-08-14`,
    dateRange: `Aug 8, ${CURRENT_YEAR} to Aug 14, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Helen Martinez",
    farmLocation: "Malaybalay, Bukidnon",
  },
  {
    id: "BK-WZ1011",
    assignedDriver: "Robert Gray",
    machineryModel: "John Deere 5075E",
    category: "Tractor",
    startDate: `${CURRENT_YEAR}-08-15`,
    endDate: `${CURRENT_YEAR}-08-22`,
    dateRange: `Aug 15, ${CURRENT_YEAR} to Aug 22, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Kyle Thompson",
    farmLocation: "Valencia, Bukidnon",
  },
  {
    id: "BK-WZ1012",
    assignedDriver: "Jessica Harris",
    machineryModel: "New Holland Roll-Belt 450",
    category: "Baler",
    startDate: `${CURRENT_YEAR}-08-18`,
    endDate: `${CURRENT_YEAR}-08-24`,
    dateRange: `Aug 18, ${CURRENT_YEAR} to Aug 24, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Nancy Davis",
    farmLocation: "Maramag, Bukidnon",
  },
  {
    id: "BK-WZ1013",
    assignedDriver: "Olivia King",
    machineryModel: "Case IH Farmall 90JX",
    category: "Tractor",
    startDate: `${CURRENT_YEAR}-08-12`,
    endDate: `${CURRENT_YEAR}-08-17`,
    dateRange: `Aug 12, ${CURRENT_YEAR} to Aug 17, ${CURRENT_YEAR}`,
    status: "Returned",
    clientName: "Michael Brown",
    farmLocation: "Quezon, Bukidnon",
  },
  {
    id: "BK-WZ1014",
    assignedDriver: "David Lee",
    machineryModel: "Isuzu Forward Flatbed Hauler",
    category: "Transport",
    startDate: `${CURRENT_YEAR}-08-16`,
    endDate: `${CURRENT_YEAR}-08-20`,
    dateRange: `Aug 16, ${CURRENT_YEAR} to Aug 20, ${CURRENT_YEAR}`,
    status: "Ongoing",
    clientName: "Oliver Scott",
    farmLocation: "Don Carlos, Bukidnon",
  },
];

// Helper to format concise, readable date ranges for driver schedule
function formatScheduleDate(item) {
  if (item.startDate) {
    const s = new Date(item.startDate);
    if (!isNaN(s.getTime())) {
      const sMonth = s.toLocaleDateString("en-US", { month: "short" });
      const sDay = s.getDate();
      const sYear = s.getFullYear();

      if (item.endDate) {
        const e = new Date(item.endDate);
        if (!isNaN(e.getTime())) {
          const eMonth = e.toLocaleDateString("en-US", { month: "short" });
          const eDay = e.getDate();
          const eYear = e.getFullYear();

          if (sMonth === eMonth && sYear === eYear) {
            if (sDay === eDay) {
              return `${sMonth} ${sDay}, ${sYear}`;
            }
            return `${sMonth} ${sDay} – ${eDay}, ${sYear}`;
          }
          if (sYear === eYear) {
            return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
          }
          return `${sMonth} ${sDay}, ${sYear} – ${eMonth} ${eDay}, ${sYear}`;
        }
      }
      return `${sMonth} ${sDay}, ${sYear}`;
    }
  }

  if (item.dateRange) {
    return item.dateRange.replace(/\s+to\s+/i, " – ");
  }

  return item.date || item.bookingDate || "Scheduled";
}

export default function Drivers() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Drivers list state
  const [drivers, setDrivers] = useState(() => {
    const cached = getCachedApiData("/drivers");
    return Array.isArray(cached) ? cached : (cached?.data || []);
  });
  // Selected driver detail panel (Default: null until selected/clicked)
  const [selectedDriver, setSelectedDriver] = useState(null);
  // Live applications / bookings
  const [liveBookings, setLiveBookings] = useState(() => {
    const cached = getCachedApiData("/applications");
    return Array.isArray(cached) ? cached : [];
  });

  // Dynamic calendar navigation state for the driver's schedule
  const [calDate, setCalDate] = useState(() => {
    return new Date(CURRENT_YEAR, 7, 1); // Default to August of current year
  });

  // Fetch drivers & live bookings from backend API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [driverRes, appRes] = await Promise.all([
          api("/drivers"),
          api("/applications"),
        ]);
        if (driverRes && driverRes.ok) {
          const rawList = Array.isArray(driverRes.data)
            ? driverRes.data
            : Array.isArray(driverRes.data?.data)
            ? driverRes.data.data
            : [];
          if (rawList.length > 0) {
            const normalized = rawList.map((d, index) => ({
              ...d,
              id: d._id || d.id || `driver-${index}`,
              _id: d._id || d.id || `driver-${index}`,
            }));
            setDrivers(normalized);
          }
        }
        if (appRes && appRes.ok) {
          const aList = Array.isArray(appRes.data)
            ? appRes.data
            : Array.isArray(appRes.data?.data)
            ? appRes.data.data
            : [];
          if (aList.length > 0) {
            setLiveBookings(aList);
          }
        }
      } catch (err) {
        console.error("Failed to load driver/booking data:", err);
      }
    };
    fetchData();
  }, []);

  // Merge live applications with default mock machinery bookings
  const allBookings = useMemo(() => {
    const formattedLive = liveBookings.map((item, idx) => {
      let days = 1;
      if (item.startDate && item.endDate) {
        const diffTime = Math.abs(new Date(item.endDate) - new Date(item.startDate));
        days = Math.max(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1, 1);
      }
      const s = (item.status || "").toLowerCase();
      let displayStatus = "Pending";
      if (s === "approved") displayStatus = "Approved";
      else if (s === "checked-out" || s === "ongoing") displayStatus = "Ongoing";
      else if (s === "returned") displayStatus = "Returned";
      else if (s === "cancelled" || s === "rejected") displayStatus = "Cancelled";

      const eq = (item.equipment || "").toLowerCase();
      let cat = "Tractor";
      if (eq.includes("harvester")) cat = "Harvester";
      else if (eq.includes("baler")) cat = "Baler";
      else if (eq.includes("rake") || eq.includes("mower")) cat = "Mower / Rake";
      else if (eq.includes("sprayer")) cat = "Sprayer";
      else if (eq.includes("hauler") || eq.includes("truck")) cat = "Transport";

      return {
        id: item.displayId || `BK-WZ${1010 + idx}`,
        assignedDriver: item.assignedDriver || "Self-Operated",
        machineryModel: item.equipment || "Machinery Unit",
        category: cat,
        startDate: item.startDate,
        endDate: item.endDate,
        dateRange: `${item.startDate} to ${item.endDate}`,
        status: displayStatus,
        clientName: item.memberName || item.farmerName || "Member",
        farmLocation: item.farmLocation || "Bukidnon",
        daysCount: days,
      };
    });

    return formattedLive;
  }, [liveBookings]);

  // All bookings assigned to the currently selected driver
  const selectedDriverBookings = useMemo(() => {
    if (!selectedDriver) return [];
    const targetName = (selectedDriver.name || "").trim().toLowerCase();
    return allBookings.filter(
      (b) => (b.assignedDriver || "").trim().toLowerCase() === targetName
    );
  }, [selectedDriver, allBookings]);

  // When selectedDriver changes, auto-align calendar to their earliest booking month
  useEffect(() => {
    if (selectedDriverBookings.length > 0) {
      const firstB = selectedDriverBookings[0];
      const dStr = firstB.startDate || firstB.bookingDate;
      if (dStr) {
        const d = new Date(dStr);
        if (!isNaN(d.getTime())) {
          setCalDate(new Date(d.getFullYear(), d.getMonth(), 1));
        }
      }
    }
  }, [selectedDriver, selectedDriverBookings]);

  // Compute dynamic calendar cells for currently viewed month and highlight assigned booking days
  const calendarCells = useMemo(() => {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];

    // Faded days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      cells.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        dateObj: new Date(year, month - 1, prevMonthDays - i),
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(year, month, d);
      // Check if driver has an assigned unit on this date
      const assignedOnDate = selectedDriverBookings.filter((b) => {
        const start = b.startDate ? new Date(b.startDate) : (b.bookingDate ? new Date(b.bookingDate) : null);
        const end = b.endDate ? new Date(b.endDate) : (b.dateRange && b.dateRange.includes("to") ? new Date(b.dateRange.split("to")[1].trim()) : start);
        if (!start) return false;
        const normalizedDay = new Date(year, month, d).setHours(0, 0, 0, 0);
        const startMs = new Date(start).setHours(0, 0, 0, 0);
        const endMs = end ? new Date(end).setHours(23, 59, 59, 999) : startMs;
        return normalizedDay >= startMs && normalizedDay <= endMs;
      });

      cells.push({
        day: d,
        isCurrentMonth: true,
        dateObj: dayDate,
        hasAssignment: assignedOnDate.length > 0,
        assignments: assignedOnDate,
      });
    }

    // Faded days to fill trailing cells
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        day: i,
        isCurrentMonth: false,
        dateObj: new Date(year, month + 1, i),
      });
    }

    return cells;
  }, [calDate, selectedDriverBookings]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy] = useState("name_asc");
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("kimpc_manager_pageSize");
    return saved ? Number(saved) : 8;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [financialsOpen, setFinancialsOpen] = useState(false);

  // Add / Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  const [driverForm, setDriverForm] = useState({
    name: "",
    email: "",
    phone: "",
    status: "On Duty",
    address: "Kalilangan, Bukidnon",
    avatar: "",
  });

  const handleAvatarFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Invalid image type. Please select a JPG, PNG, or WebP photo.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target.result;
      setUploadingAvatar(true);
      try {
        const res = await api("/machinery-units/upload-photo", {
          method: "POST",
          body: { image: base64Data, filename: `driver-${Date.now()}` },
        });
        if (res && res.ok && res.data?.imageUrl) {
          setDriverForm((prev) => ({ ...prev, avatar: res.data.imageUrl }));
        } else {
          setDriverForm((prev) => ({ ...prev, avatar: base64Data }));
        }
      } catch {
        setDriverForm((prev) => ({ ...prev, avatar: base64Data }));
      } finally {
        setUploadingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Filtered list
  const filteredDrivers = useMemo(() => {
    let result = drivers.filter((d) => {
      const matchesSearch =
        !searchQuery.trim() ||
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.phone.includes(searchQuery.trim());

      const matchesStatus =
        filterStatus === "All" || d.status.toLowerCase() === filterStatus.toLowerCase();

      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      if (sortBy === "name_desc") return (b.name || "").localeCompare(a.name || "");
      if (sortBy === "status") return (a.status || "").localeCompare(b.status || "");
      // Default: "name_asc"
      return (a.name || "").localeCompare(b.name || "");
    });

    return result;
  }, [drivers, searchQuery, filterStatus, sortBy]);

  const totalPages = Math.ceil(filteredDrivers.length / pageSize) || 1;
  const paginatedDrivers = useMemo(() => {
    return filteredDrivers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredDrivers, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, sortBy]);

  // Handle Save Driver (Create or Edit)
  const handleSaveDriver = async (e) => {
    e.preventDefault();
    if (!driverForm.name.trim() || !driverForm.email.trim()) {
      alert("Name and email are required.");
      return;
    }

    if (editingDriver) {
      const targetId = editingDriver._id || editingDriver.id;
      try {
        const res = await api(`/drivers/${targetId}`, {
          method: "PUT",
          body: {
            name: driverForm.name.trim(),
            email: driverForm.email.trim(),
            phone: driverForm.phone.trim(),
            status: driverForm.status,
            address: driverForm.address.trim(),
            avatar: driverForm.avatar.trim() || editingDriver.avatar || "",
          },
        });
        const saved = res && res.ok ? (res.data?.data || res.data) : null;
        if (saved) {
          const normalizedSaved = {
            ...saved,
            id: saved._id || saved.id || `driver-${Date.now()}`,
            _id: saved._id || saved.id || `driver-${Date.now()}`,
          };
          const updated = drivers.map((d) =>
            d._id === targetId || d.id === targetId ? normalizedSaved : d
          );
          setDrivers(updated);
          setSelectedDriver(normalizedSaved);
          setEditingDriver(null);
          setShowAddModal(false);
        } else {
          alert(res?.data?.error || "Failed to update driver in database.");
        }
      } catch (err) {
        console.error("Error updating driver:", err);
        alert(err.message || "Network error updating driver.");
      }
    } else {
      const newD = {
        name: driverForm.name.trim(),
        email: driverForm.email.trim(),
        phone: driverForm.phone.trim() || "555-000-1234",
        status: driverForm.status,
        avatar: driverForm.avatar.trim() || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
        address: driverForm.address.trim() || "Kalilangan, Bukidnon",
        workHours: 160,
        performance: 4.5,
        performanceLabel: "Excellent",
        dutyDays: [1, 2, 6, 8, 9, 13, 14, 18, 20, 21, 28],
        schedule: [],
      };
      try {
        const res = await api("/drivers", {
          method: "POST",
          body: newD,
        });
        if (res && res.ok) {
          const saved = res.data?.data || res.data;
          const normalizedSaved = {
            ...saved,
            id: saved._id || saved.id || `driver-${Date.now()}`,
            _id: saved._id || saved.id || `driver-${Date.now()}`,
          };
          setDrivers([normalizedSaved, ...drivers]);
          setSelectedDriver(normalizedSaved);
          setShowAddModal(false);
          setDriverForm({
            name: "",
            email: "",
            phone: "",
            status: "On Duty",
            address: "Kalilangan, Bukidnon",
            avatar: "",
          });
        } else {
          alert(res?.data?.error || "Failed to save driver to the database. Please try again.");
        }
      } catch (err) {
        console.error("Error creating driver:", err);
        alert(err.message || "Network error saving driver to database.");
      }
    }
  };

  const handleDeleteDriver = async (driver) => {
    if (!driver) return;
    const targetId = driver._id || driver.id;
    if (!window.confirm(`Are you sure you want to delete driver "${driver.name}" from the database?`)) return;
    try {
      const res = await api(`/drivers/${targetId}`, { method: "DELETE" });
      if (res && res.ok) {
        setDrivers((prev) => prev.filter((d) => d._id !== targetId && d.id !== targetId));
        if (selectedDriver && (selectedDriver._id === targetId || selectedDriver.id === targetId)) {
          setSelectedDriver(null);
        }
      } else {
        alert(res?.data?.error || "Failed to delete driver.");
      }
    } catch (err) {
      console.error("Error deleting driver:", err);
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
      <main className="wz-content-wrapper wz-drivers-content-wrapper">
        {/* Top bar with Title & User Profile - spans full width */}
        <ManagerTopbar title="Drivers" />

        {/* Toolbar: Search + Status Filter + Sort + Add Driver Button */}
        <div className="wz-drivers-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <ManagerSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              placeholder="Search driver name, email, phone..."
              filters={[
                {
                  id: "status",
                  label: "Driver Status",
                  value: filterStatus,
                  defaultValue: "All",
                  onChange: setFilterStatus,
                  options: [
                    { value: "All", label: "All Statuses" },
                    { value: "On Duty", label: "On Duty" },
                    { value: "Sick Leave", label: "Sick Leave" },
                    { value: "Half-Day Leave", label: "Half-Day Leave" },
                  ],
                },
              ]}
              sort={{
                value: sortBy,
                defaultValue: "name_asc",
                onChange: setSortBy,
                options: [
                  { value: "name_asc", label: "Name (A-Z)" },
                  { value: "name_desc", label: "Name (Z-A)" },
                  { value: "status", label: "By Status" },
                ],
              }}
            />
          </div>

          <button
            className="wz-btn-add-driver"
            onClick={() => {
              setEditingDriver(null);
              setDriverForm({
                name: "",
                email: "",
                phone: "",
                status: "On Duty",
                address: "Kalilangan, Bukidnon",
                avatar: "",
              });
              setShowAddModal(true);
            }}
          >
            Add Driver
          </button>
        </div>

        {/* ================= Body Layout: Driver Directory Table + Driver Detail Panel ================= */}
        <div className="wz-drivers-body-layout">
          {/* Driver Directory Table Card */}
          <div className="wz-driver-table-card">
            <div className="wz-driver-table-wrapper">
              <table className="wz-driver-table">
                <thead>
                  <tr>
                    <th>Name <span className="wz-sort-arrow">↕</span></th>
                    <th>Email <span className="wz-sort-arrow">↕</span></th>
                    <th>Phone No. <span className="wz-sort-arrow">↕</span></th>
                    <th>Status <span className="wz-sort-arrow">↕</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDrivers.map((d) => {
                    const isSelected = Boolean(
                      selectedDriver &&
                        ((selectedDriver._id && d._id && selectedDriver._id === d._id) ||
                          (selectedDriver.id && d.id && selectedDriver.id === d.id) ||
                          (selectedDriver.name && d.name && selectedDriver.name.trim().toLowerCase() === d.name.trim().toLowerCase()))
                    );

                    return (
                      <tr
                        key={d._id || d.id || d.name}
                        className={`wz-driver-row ${isSelected ? "wz-driver-row-selected" : ""}`}
                        onClick={() => setSelectedDriver(d)}
                      >
                        {/* Name + Avatar */}
                        <td>
                          <div className="wz-driver-name-cell">
                            <img src={d.avatar} alt={d.name} className="wz-driver-table-avatar" />
                            <span className="wz-driver-table-name">{d.name}</span>
                          </div>
                        </td>

                        {/* Email */}
                        <td style={{ color: "#64748b" }}>{d.email}</td>

                        {/* Phone */}
                        <td style={{ color: "#64748b" }}>{d.phone}</td>

                        {/* Status */}
                        <td>
                          <span
                            className={`wz-driver-status-pill ${
                              d.status === "On Duty"
                                ? "wz-status-onduty"
                                : d.status === "Sick Leave"
                                ? "wz-status-sick"
                                : "wz-status-halfday"
                            }`}
                          >
                            <span className="wz-status-dot" />
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="wz-table-footer" style={{ padding: "14px 18px", borderTop: "1px solid var(--wz-border)", background: "#ffffff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#64748b" }}>
                <span>Results per page:</span>
                <select
                  className="wz-dropdown-select"
                  value={pageSize}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setPageSize(val);
                    setCurrentPage(1);
                    localStorage.setItem("kimpc_manager_pageSize", String(val));
                  }}
                >
                  <option value="8">8</option>
                  <option value="16">16</option>
                  <option value="24">24</option>
                  <option value="50">50</option>
                </select>
                <span style={{ marginLeft: "12px" }}>
                  Showing {filteredDrivers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filteredDrivers.length)} of {filteredDrivers.length} drivers
                </span>
              </div>

              <div className="wz-pagination-btns">
                <button
                  className="wz-page-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous Page"
                >
                  &lt;
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`wz-page-btn ${p === currentPage ? "active" : ""}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                ))}

                <button
                  className="wz-page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Next Page"
                >
                  &gt;
                </button>
              </div>
            </div>
          </div>

          {/* ================= Right Sidebar: Driver Detail Profile & Schedule ================= */}
          {selectedDriver && (
            <aside className="wz-driver-detail-panel">
              {/* 1. Header Profile Card */}
              <div className="wz-driver-profile-header">
                <div className="wz-driver-profile-left">
                  <img
                    src={selectedDriver.avatar}
                    alt={selectedDriver.name}
                    className="wz-driver-profile-avatar"
                  />
                  <div>
                    <div className="wz-driver-profile-name">{selectedDriver.name}</div>
                    <span
                      className={`wz-driver-status-pill ${
                        selectedDriver.status === "On Duty"
                          ? "wz-status-onduty"
                          : selectedDriver.status === "Sick Leave"
                          ? "wz-status-sick"
                          : "wz-status-halfday"
                      }`}
                    >
                      <span className="wz-status-dot" />
                      {selectedDriver.status}
                    </span>
                  </div>
                </div>

                <div className="wz-driver-profile-actions">
                  <button
                    className="wz-btn-driver-ban"
                    title="Delete Driver"
                    onClick={() => handleDeleteDriver(selectedDriver)}
                  >
                    🗑
                  </button>
                  <button
                    className="wz-btn-driver-edit"
                    title="Edit Driver Profile"
                    onClick={() => {
                      setEditingDriver(selectedDriver);
                      setDriverForm({
                        name: selectedDriver.name,
                        email: selectedDriver.email,
                        phone: selectedDriver.phone,
                        status: selectedDriver.status,
                        address: selectedDriver.address || "Kalilangan, Bukidnon",
                        avatar: selectedDriver.avatar || "",
                      });
                      setShowAddModal(true);
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    className="wz-cal-btn-close"
                    title="Close Details"
                    onClick={() => setSelectedDriver(null)}
                  >
                    &times;
                  </button>
                </div>
              </div>

            {/* 2. Contact Information Block */}
            <div className="wz-driver-contact-list">
              <div className="wz-driver-contact-item">
                <span className="wz-driver-contact-icon">✉</span>
                <span>{selectedDriver.email}</span>
              </div>
              <div className="wz-driver-contact-item">
                <span className="wz-driver-contact-icon">📞</span>
                <span>{selectedDriver.phone}</span>
              </div>
              <div className="wz-driver-contact-item">
                <span className="wz-driver-contact-icon">📍</span>
                <span>{selectedDriver.address}</span>
              </div>
            </div>

            {/* 3. Mini Attendance / Duty Calendar */}
            <div className="wz-driver-calendar-card">
              <div className="wz-driver-cal-header">
                <span className="wz-driver-cal-title">
                  {calDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <div className="wz-driver-cal-arrows">
                  <button
                    type="button"
                    className="wz-driver-cal-arrow-btn"
                    title="Previous Month"
                    onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))}
                  >
                    &lt;
                  </button>
                  <button
                    type="button"
                    className="wz-driver-cal-arrow-btn"
                    title="Next Month"
                    onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))}
                  >
                    &gt;
                  </button>
                </div>
              </div>

              <div className="wz-driver-cal-weekdays">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="wz-driver-cal-days-grid">
                {calendarCells.map((item, idx) => {
                  const isDuty = item.isCurrentMonth && item.hasAssignment;
                  const tooltipText = isDuty && item.assignments && item.assignments.length > 0
                    ? `Assigned: ${item.assignments.map((a) => a.machineryModel || a.unitName).join(", ")}`
                    : undefined;

                  return (
                    <div
                      key={idx}
                      title={tooltipText}
                      className={`wz-driver-cal-day-cell ${
                        isDuty ? "wz-driver-cal-day-duty" : ""
                      } ${!item.isCurrentMonth ? "wz-driver-cal-day-faded" : ""}`}
                    >
                      {item.day}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Schedule Section (Reflects Assigned Machinery Units) */}
            <div className="wz-driver-schedule-card">
              <div className="wz-driver-schedule-header">
                <h4 className="wz-driver-schedule-title">Schedule</h4>
                <span className="wz-driver-schedule-count">
                  {selectedDriverBookings.length} {selectedDriverBookings.length === 1 ? "Duty" : "Duties"}
                </span>
              </div>

              {selectedDriverBookings.length === 0 ? (
                <div className="wz-driver-schedule-empty">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>No machinery schedule assigned for this driver.</span>
                </div>
              ) : (
                <div className="wz-driver-schedule-list">
                  {selectedDriverBookings.map((item, idx) => {
                    const unitName = item.machineryModel || item.unitName || item.vehicle || "Heavy Machinery";
                    const category = item.category || "Machinery";
                    const bId = item.id ? (String(item.id).startsWith("#") ? item.id : `#${item.id}`) : `#BK-${String(item._id || "").slice(-4)}`;
                    const location = item.farmLocation || item.location || "Bukidnon";
                    const statusText = item.status || "Assigned";

                    const sLower = statusText.toLowerCase();
                    const isPending = sLower.includes("pending");
                    const isCompleted = sLower.includes("complete") || sLower.includes("returned") || sLower.includes("done");
                    const isCancelled = sLower.includes("cancel") || sLower.includes("reject");
                    const isOngoing = sLower.includes("ongoing") || sLower.includes("checked-out");

                    return (
                      <div key={item._id || item.id || idx} className="wz-driver-sched-card">
                        {/* Top: Date Range & Status Pill */}
                        <div className="wz-driver-sched-card-top">
                          <div className="wz-driver-sched-date-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{formatScheduleDate(item)}</span>
                          </div>

                          <span
                            className="wz-driver-sched-status"
                            style={{
                              backgroundColor: isOngoing
                                ? "#e0f2fe"
                                : isCompleted
                                ? "#dcfce7"
                                : isCancelled
                                ? "#fee2e2"
                                : isPending
                                ? "#fef3c7"
                                : "#f1f5f9",
                              color: isOngoing
                                ? "#0284c7"
                                : isCompleted
                                ? "#16a34a"
                                : isCancelled
                                ? "#dc2626"
                                : isPending
                                ? "#d97706"
                                : "#475569",
                            }}
                          >
                            {statusText}
                          </span>
                        </div>

                        {/* Middle: Machinery Unit Name & Category */}
                        <div className="wz-driver-sched-unit-row">
                          <div className="wz-driver-sched-unit-name">{unitName}</div>
                          <span className="wz-driver-sched-cat-tag">{category}</span>
                        </div>

                        {/* Bottom: Location & Booking ID */}
                        <div className="wz-driver-sched-bottom-row">
                          <div className="wz-driver-sched-loc" title={location}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span>{location}</span>
                          </div>

                          <span className="wz-driver-sched-id">{bId}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
        </div>
      </main>

      {/* ================= Add / Edit Driver Modal ================= */}
      {(showAddModal || editingDriver) && (
        <div
          className="wz-modal-overlay"
          onClick={() => {
            setShowAddModal(false);
            setEditingDriver(null);
          }}
        >
          <div className="wz-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                {editingDriver ? "Edit Driver Profile" : "Add New Driver"}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingDriver(null);
                }}
                style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#94a3b8" }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveDriver}>
              {/* Profile Photo Upload / Edit */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 14px",
                  background: "#ffffff",
                  border: "1px dashed #cbd5e1",
                  borderRadius: "10px",
                  marginBottom: "14px",
                }}
              >
                <div style={{ position: "relative", width: "56px", height: "56px", flexShrink: 0 }}>
                  {driverForm.avatar ? (
                    <img
                      src={driverForm.avatar}
                      alt="Driver Avatar"
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "2px solid #e2e8f0",
                        boxShadow: "0 2px 5px rgba(0,0,0,0.08)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "#0f172a",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem",
                        fontWeight: "700",
                      }}
                    >
                      {driverForm.name ? driverForm.name.charAt(0).toUpperCase() : "👤"}
                    </div>
                  )}
                  {driverForm.avatar && (
                    <button
                      type="button"
                      title="Clear photo"
                      onClick={() => setDriverForm((p) => ({ ...p, avatar: "" }))}
                      style={{
                        position: "absolute",
                        top: "-4px",
                        right: "-4px",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: "#ef4444",
                        color: "#ffffff",
                        border: "none",
                        fontSize: "10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                    <input
                      type="file"
                      ref={avatarInputRef}
                      onChange={handleAvatarFileChange}
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      disabled={uploadingAvatar}
                      onClick={() => avatarInputRef.current && avatarInputRef.current.click()}
                      style={{
                        padding: "6px 12px",
                        background: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.78rem",
                        fontWeight: "600",
                        cursor: uploadingAvatar ? "not-allowed" : "pointer",
                      }}
                    >
                      {uploadingAvatar ? "Uploading..." : driverForm.avatar ? "Change Photo" : "Upload Photo"}
                    </button>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>JPG, PNG, WebP (Max 5MB)</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Or paste direct image URL (https://...)"
                    value={driverForm.avatar}
                    onChange={(e) => setDriverForm({ ...driverForm, avatar: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      fontSize: "0.78rem",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                  Driver Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daniel Jackson"
                  value={driverForm.name}
                  onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="driver@example.com"
                    value={driverForm.email}
                    onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="999-000-1111"
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Duty Status
                  </label>
                  <select
                    value={driverForm.status}
                    onChange={(e) => setDriverForm({ ...driverForm, status: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem", background: "#fff" }}
                  >
                    <option value="On Duty">On Duty</option>
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Half-Day Leave">Half-Day Leave</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Address
                  </label>
                  <input
                    type="text"
                    placeholder="123 Elm Street"
                    value={driverForm.address}
                    onChange={(e) => setDriverForm({ ...driverForm, address: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingDriver(null);
                  }}
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
                  {editingDriver ? "Update Driver" : "Save Driver"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

