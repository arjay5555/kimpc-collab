import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, getCachedApiData } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

// Machinery type options
const MACHINERY_TYPES = [
  "Tractor",
  "Harvester",
  "Baler",
  "Planter / Seeder",
  "Sprayer",
  "Mower / Rake",
  "Transport / Truck",
  "Other",
];

// Fuel type options
const FUEL_TYPES = ["Diesel", "Gasoline", "Electric", "Hybrid", "Biofuel", "Other"];

// Pricing units
const PRICING_UNITS = ["Per Hectare", "Per Hour", "Per Day"];

// Fee basis options
const FEE_BASIS_OPTIONS = [
  "per booking",
  "per hectare",
  "per hour",
  "per day",
  "per trip",
];

// Operating condition options
const OPERATING_CONDITIONS = ["Operational", "Under Maintenance", "Retired"];

// Acquisition source options
const ACQUISITION_SOURCES = [
  "Purchased New",
  "Purchased Used",
  "Government Grant",
  "Donated",
  "Leased",
  "Other",
];

// Default initial form state
const EMPTY_UNIT_FORM = {
  // 1. Basic Information
  unitId: "",
  unitPrefix: "",
  name: "",
  category: "Tractor",
  brand: "",
  model: "",
  serialNumber: "",
  modelYear: String(new Date().getFullYear()),
  imageUrl: "",
  photos: [],

  // 2. Specifications
  horsepower: "",
  capacity: "",
  fuelType: "Diesel",
  attachments: "",

  // 3. Rental & Pricing
  pricingUnit: "Per Hectare",
  memberRate: 2800,
  nonmemberRate: 3500,
  minRentalQuantity: 1,
  operatorRequired: false,
  operatorIncluded: false,
  fuelIncluded: false,
  transportIncluded: false,
  additionalOperatorFee: 0,
  operatorFeeBasis: "per day",
  additionalTransportFee: 0,
  transportFeeBasis: "per trip",

  // 4. Condition & Maintenance
  operatingCondition: "Operational",
  currentMeterReading: 0,
  meterReadingUnit: "Hours",
  lastServiceDate: "",
  lastServiceMeterReading: "",
  nextServiceDate: "",
  nextServiceMeterReading: "",
  conditionNotes: "",

  // 5. Ownership & Location
  acquisitionDate: "",
  acquisitionCost: 0,
  acquisitionSource: "Purchased New",
  storageLocation: "Main Co-op Depot, Malaybalay",

  // 6. Other Information
  operatingRestrictions: "",
  notes: "",
  assignedDriver: "Unassigned",
  driverPhone: "",
};

// Fallback registered drivers if database collection is empty
const DEFAULT_DRIVERS = [
  { id: "d1", name: "John Adams", email: "john.adams@example.com", phone: "111-222-3333", status: "On Duty" },
  { id: "d2", name: "Emily Brown", email: "emily.brown@example.com", phone: "222-333-4444", status: "Sick Leave" },
  { id: "d3", name: "Michael Clark", email: "michael.clark@example.com", phone: "333-444-5555", status: "On Duty" },
  { id: "d4", name: "Sarah Davis", email: "sarah.davis@example.com", phone: "444-555-6666", status: "Half-Day Leave" },
  { id: "d5", name: "James Evans", email: "james.evans@example.com", phone: "555-666-7777", status: "On Duty" },
  { id: "d6", name: "Laura Fisher", email: "laura.fisher@example.com", phone: "666-777-8888", status: "On Duty" },
  { id: "d7", name: "Robert Gray", email: "robert.gray@example.com", phone: "777-888-9999", status: "Sick Leave" },
  { id: "d8", name: "Jessica Harris", email: "jessica.harris@example.com", phone: "888-999-0000", status: "On Duty" },
  { id: "d9", name: "Daniel Jackson", email: "daniel.jackson@example.com", phone: "999-000-1111", status: "On Duty" },
  { id: "d10", name: "Olivia King", email: "olivia.king@example.com", phone: "000-111-2222", status: "On Duty" },
  { id: "d11", name: "David Lee", email: "david.lee@example.com", phone: "111-222-3334", status: "Half-Day Leave" },
];

export default function Units() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Data states
  const [units, setUnits] = useState(() => {
    const cached = getCachedApiData("/machinery-units");
    return Array.isArray(cached) ? cached : (cached?.data || []);
  });
  const [typePrefixes, setTypePrefixes] = useState(() => {
    const cached = getCachedApiData("/machinery-units");
    return cached?.typePrefixes && typeof cached.typePrefixes === "object"
      ? cached.typePrefixes
      : {};
  });
  const [prefixNextNumbers, setPrefixNextNumbers] = useState(() => {
    const cached = getCachedApiData("/machinery-units");
    return cached?.prefixNextNumbers && typeof cached.prefixNextNumbers === "object"
      ? cached.prefixNextNumbers
      : {};
  });
  const [counts, setCounts] = useState(() => {
    const cached = getCachedApiData("/machinery-units");
    if (cached?.counts) return cached.counts;
    const list = Array.isArray(cached) ? cached : (cached?.data || []);
    const total = list.length;
    const operational = list.filter((u) => (u.operatingCondition || u.status) === "Operational" || (u.status === "Available")).length;
    const underMaintenance = list.filter((u) => (u.operatingCondition || u.status) === "Under Maintenance" || ["Maintenance", "Repair"].includes(u.status)).length;
    const retired = list.filter((u) => (u.operatingCondition || u.status) === "Retired" || ["Dispose", "Unavailable", "Retired"].includes(u.status)).length;
    return { total, operational, underMaintenance, retired };
  });
  const [loading, setLoading] = useState(() => !getCachedApiData("/machinery-units"));
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // Registered Drivers state & Assign Driver Modal
  const [drivers, setDrivers] = useState(() => {
    const cached = getCachedApiData("/drivers");
    return Array.isArray(cached) ? cached : [];
  });
  const [driversLoading, setDriversLoading] = useState(false);
  const [driverModalUnit, setDriverModalUnit] = useState(null);
  const [driverSearchQuery, setDriverSearchQuery] = useState("");
  const [driverSubmitting, setDriverSubmitting] = useState(false);
  const [driverError, setDriverError] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterCondition, setFilterCondition] = useState("All");
  const [sortBy, setSortBy] = useState("newest");

  // View Mode: 'table' (primary required view) or 'grid' (cards)
  const [viewMode, setViewMode] = useState("table");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("kimpc_manager_pageSize");
    return saved ? Number(saved) : 8;
  });

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [activeFormTab, setActiveFormTab] = useState("basic"); // basic | specs | service
  const [unitForm, setUnitForm] = useState(EMPTY_UNIT_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitSaveError, setUnitSaveError] = useState("");
  const [customTypeMode, setCustomTypeMode] = useState(false);
  const [lastSelectedType, setLastSelectedType] = useState("Tractor");

  // View Details Modal
  const [viewingUnit, setViewingUnit] = useState(null);
  const [unitDetailsData, setUnitDetailsData] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Retire Modal
  const [retiringUnit, setRetiringUnit] = useState(null);
  const [retireBlockers, setRetireBlockers] = useState(null);
  const [retiringLoading, setRetiringLoading] = useState(false);

  // Change Status Modal (Operational, Under Maintenance, Retired)
  const [statusModalUnit, setStatusModalUnit] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState("Operational");
  const [statusNotes, setStatusNotes] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Image Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  // Fetch registered drivers from API
  const fetchDrivers = async () => {
    try {
      setDriversLoading(true);
      const res = await api("/drivers");
      const list =
        res && res.ok
          ? Array.isArray(res.data)
            ? res.data
            : Array.isArray(res.data?.data)
            ? res.data.data
            : []
          : [];
      if (list.length > 0) {
        setDrivers(list);
      } else {
        setDrivers([]);
      }
    } catch (err) {
      console.error("Error loading drivers:", err);
      setDrivers([]);
    } finally {
      setDriversLoading(false);
    }
  };

  // Fetch machinery units
  const fetchUnits = async () => {
    try {
      if (!getCachedApiData("/machinery-units")) {
        setLoading(true);
      }
      const res = await api("/machinery-units");
      if (res.ok && res.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data.data || []);
        setUnits(list);
        if (res.data.typePrefixes && typeof res.data.typePrefixes === "object") {
          setTypePrefixes(res.data.typePrefixes);
        }
        if (res.data.prefixNextNumbers && typeof res.data.prefixNextNumbers === "object") {
          setPrefixNextNumbers(res.data.prefixNextNumbers);
        }
        if (res.data.counts) {
          setCounts(res.data.counts);
        } else {
          // Calculate counts client-side if needed
          const total = list.length;
          const operational = list.filter((u) => (u.operatingCondition || u.status) === "Operational" || (u.status === "Available")).length;
          const underMaintenance = list.filter((u) => (u.operatingCondition || u.status) === "Under Maintenance" || ["Maintenance", "Repair"].includes(u.status)).length;
          const retired = list.filter((u) => (u.operatingCondition || u.status) === "Retired" || ["Dispose", "Unavailable", "Retired"].includes(u.status)).length;
          setCounts({ total, operational, underMaintenance, retired });
        }
      }
    } catch (err) {
      console.error("Error loading units:", err);
      setFeedback({ message: "Failed to load machinery fleet units.", isError: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
    fetchDrivers();
  }, []);

  // Quick Change Driver modal handlers
  const openChangeDriverModal = (unit) => {
    setDriverModalUnit(unit);
    setDriverSearchQuery("");
    setDriverError("");
    fetchDrivers();
  };

  const handleAssignDriver = async (driverName, driverPhone = "") => {
    if (!driverModalUnit) return;
    setDriverSubmitting(true);
    setDriverError("");
    try {
      const res = await api(`/machinery-units/${driverModalUnit._id || driverModalUnit.id || driverModalUnit.unitId}/driver`, {
        method: "PATCH",
        body: {
          assignedDriver: driverName,
          driverPhone: driverPhone,
        },
      });

      if (res.ok) {
        setUnits((prev) =>
          prev.map((u) =>
            u._id === driverModalUnit._id || u.unitId === driverModalUnit.unitId
              ? { ...u, assignedDriver: driverName, driverPhone: driverPhone }
              : u
          )
        );
        if (viewingUnit && (viewingUnit._id === driverModalUnit._id || viewingUnit.unitId === driverModalUnit.unitId)) {
          setViewingUnit((prev) => ({ ...prev, assignedDriver: driverName, driverPhone: driverPhone }));
        }
        setFeedback({
          message:
            driverName === "Unassigned"
              ? `Driver assignment removed for ${driverModalUnit.unitId}.`
              : `Assigned driver "${driverName}" to machinery unit ${driverModalUnit.unitId}.`,
          isError: false,
        });
        setDriverModalUnit(null);
      } else {
        setDriverError(res.data?.error || res.error || "Failed to assign driver.");
      }
    } catch (err) {
      setDriverError(err.message || "Network error updating driver assignment.");
    } finally {
      setDriverSubmitting(false);
    }
  };

  // Filtered and searched units
  const filteredUnits = useMemo(() => {
    let result = units.filter((u) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (u.unitId && u.unitId.toLowerCase().includes(q)) ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.brand && u.brand.toLowerCase().includes(q)) ||
        (u.model && u.model.toLowerCase().includes(q)) ||
        (u.serialNumber && u.serialNumber.toLowerCase().includes(q)) ||
        (u.category && u.category.toLowerCase().includes(q));

      const matchesType =
        filterType === "All" || (u.category && u.category.toLowerCase() === filterType.toLowerCase());

      const cond = u.operatingCondition || (
        u.status === "Available" ? "Operational" :
        ["Maintenance", "Repair"].includes(u.status) ? "Under Maintenance" : "Retired"
      );
      const matchesCondition =
        filterCondition === "All" || cond.toLowerCase() === filterCondition.toLowerCase();

      return matchesSearch && matchesType && matchesCondition;
    });

    result.sort((a, b) => {
      if (sortBy === "name_asc") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "name_desc") return (b.name || "").localeCompare(a.name || "");
      if (sortBy === "rate_asc") return (Number(a.memberRate !== undefined ? a.memberRate : a.ratePerDay || 0)) - (Number(b.memberRate !== undefined ? b.memberRate : b.ratePerDay || 0));
      if (sortBy === "rate_desc") return (Number(b.memberRate !== undefined ? b.memberRate : b.ratePerDay || 0)) - (Number(a.memberRate !== undefined ? a.memberRate : a.ratePerDay || 0));
      if (sortBy === "oldest") return (new Date(a.createdAt || 0)) - (new Date(b.createdAt || 0));
      // Default: "newest"
      return (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0));
    });

    return result;
  }, [units, searchQuery, filterType, filterCondition, sortBy]);

  // Existing machinery types (defaults + any custom types saved in inventory)
  const availableMachineryTypes = useMemo(() => {
    const baseWithoutOther = MACHINERY_TYPES.filter((t) => t !== "Other");
    const seen = new Set(baseWithoutOther.map((t) => t.toLowerCase()));
    const result = [...baseWithoutOther];

    units.forEach((u) => {
      const cat = String(u.category || "").trim();
      if (cat && !seen.has(cat.toLowerCase()) && cat.toLowerCase() !== "other") {
        seen.add(cat.toLowerCase());
        result.push(cat);
      }
    });

    result.push("Other");
    return result;
  }, [units]);

  const modalMachineryTypes = useMemo(() => {
    const trimmed = String(unitForm.category || "").trim();
    if (!trimmed || customTypeMode) return availableMachineryTypes;
    return availableMachineryTypes.includes(trimmed)
      ? availableMachineryTypes
      : [trimmed, ...availableMachineryTypes];
  }, [availableMachineryTypes, unitForm.category, customTypeMode]);

  // Paginated units
  const totalPages = Math.max(1, Math.ceil(filteredUnits.length / pageSize));
  const paginatedUnits = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUnits.slice(start, start + pageSize);
  }, [filteredUnits, currentPage, pageSize]);

  // Reset to page 1 on search, filter, or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterCondition, sortBy, pageSize]);

  // Auto-dismiss feedback message after 5 seconds
  useEffect(() => {
    if (feedback.message) {
      const timer = setTimeout(() => setFeedback({ message: "", isError: false }), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const normalizePrefix = (raw) =>
    String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);

  const extractIdPrefixAndNum = (unitId) => {
    const match = String(unitId || "")
      .trim()
      .toUpperCase()
      .match(/^([A-Z0-9]+)-(\d+)$/);
    if (!match) return null;
    return { prefix: match[1], num: parseInt(match[2], 10) };
  };

  const getSavedPrefixForType = (typeName) => {
    const cleanType = String(typeName || "").trim().toLowerCase();
    if (!cleanType) return "";
    for (const [k, v] of Object.entries(typePrefixes || {})) {
      if (k.toLowerCase() === cleanType && v) {
        return normalizePrefix(v);
      }
    }
    const existingUnit = units.find(
      (u) =>
        String(u.category || "").trim().toLowerCase() === cleanType &&
        extractIdPrefixAndNum(u.unitId)
    );
    return existingUnit ? extractIdPrefixAndNum(existingUnit.unitId).prefix : "";
  };

  const findPrefixConflict = (prefix, currentTypeName) => {
    const cleanPref = normalizePrefix(prefix);
    if (!cleanPref) return null;
    const currentLower = String(currentTypeName || "").trim().toLowerCase();

    for (const [k, v] of Object.entries(typePrefixes || {})) {
      if (normalizePrefix(v) === cleanPref && k.toLowerCase() !== currentLower) {
        return k;
      }
    }

    const conflictingUnit = units.find((u) => {
      const parsed = extractIdPrefixAndNum(u.unitId);
      const uCat = String(u.category || "").trim();
      return parsed && parsed.prefix === cleanPref && uCat.toLowerCase() !== currentLower;
    });
    return conflictingUnit ? conflictingUnit.category : null;
  };

  const hasExistingUnitsForType = (typeName) => {
    const cleanType = String(typeName || "").trim().toLowerCase();
    if (!cleanType) return false;
    return units.some((u) => String(u.category || "").trim().toLowerCase() === cleanType);
  };

  const getNextUnitIdForPrefix = (prefix) => {
    const cleanPref = normalizePrefix(prefix);
    if (!cleanPref) return "";
    let maxNum = prefixNextNumbers[cleanPref] ? prefixNextNumbers[cleanPref] - 1 : 0;
    units.forEach((u) => {
      const parsed = extractIdPrefixAndNum(u.unitId);
      if (parsed && parsed.prefix === cleanPref && parsed.num > maxNum) {
        maxNum = parsed.num;
      }
    });
    const nextNum = maxNum + 1;
    return `${cleanPref}-${String(nextNum).padStart(3, "0")}`;
  };

  // Open Add Modal
  const openAddModal = () => {
    setEditingUnit(null);
    const initialCat = EMPTY_UNIT_FORM.category;
    const savedPref = getSavedPrefixForType(initialCat);
    setUnitForm({
      ...EMPTY_UNIT_FORM,
      category: initialCat,
      unitPrefix: savedPref,
      unitId: savedPref ? getNextUnitIdForPrefix(savedPref) : "",
    });
    setFormErrors({});
    setUnitSaveError("");
    setCustomTypeMode(false);
    setLastSelectedType(initialCat);
    setActiveFormTab("basic");
    if (!drivers || drivers.length === 0) {
      fetchDrivers();
    }
    setShowAddModal(true);
  };

  // Open Edit Modal
  const openEditModal = (u) => {
    setEditingUnit(u);
    const canonicalCat =
      availableMachineryTypes.find(
        (t) => t.toLowerCase() === String(u.category || "").trim().toLowerCase()
      ) ||
      String(u.category || "").trim() ||
      "Tractor";
    const resolvedPref =
      getSavedPrefixForType(canonicalCat) || extractIdPrefixAndNum(u.unitId)?.prefix || "";
    setUnitForm({
      unitId: u.unitId || "",
      unitPrefix: resolvedPref,
      name: u.name || "",
      category: canonicalCat,
      brand: u.brand || "",
      model: u.model || "",
      serialNumber: u.serialNumber || "",
      modelYear: u.modelYear || String(new Date().getFullYear()),
      imageUrl: u.imageUrl || "",
      photos: Array.isArray(u.photos) ? u.photos : (u.imageUrl ? [u.imageUrl] : []),

      horsepower: u.horsepower !== null && u.horsepower !== undefined ? u.horsepower : "",
      capacity: u.capacity || "",
      fuelType: u.fuelType || "Diesel",
      attachments: Array.isArray(u.attachments) ? u.attachments.join(", ") : (u.attachments || ""),

      pricingUnit: u.pricingUnit || "Per Hectare",
      memberRate: u.memberRate !== undefined ? u.memberRate : (u.ratePerDay || 2500),
      nonmemberRate: u.nonmemberRate !== undefined && u.nonmemberRate !== null ? u.nonmemberRate : "",
      minRentalQuantity: u.minRentalQuantity || 1,
      operatorRequired: Boolean(u.operatorRequired),
      operatorIncluded: Boolean(u.operatorIncluded),
      fuelIncluded: Boolean(u.fuelIncluded),
      transportIncluded: Boolean(u.transportIncluded),
      additionalOperatorFee: u.additionalOperatorFee || 0,
      operatorFeeBasis: u.operatorFeeBasis || "per day",
      additionalTransportFee: u.additionalTransportFee || 0,
      transportFeeBasis: u.transportFeeBasis || "per trip",

      operatingCondition: u.operatingCondition || (
        u.status === "Available" ? "Operational" :
        ["Maintenance", "Repair"].includes(u.status) ? "Under Maintenance" : "Retired"
      ),
      currentMeterReading: u.currentMeterReading !== undefined ? u.currentMeterReading : (u.operatingHours || 0),
      meterReadingUnit: u.meterReadingUnit || "Hours",
      lastServiceDate: u.lastServiceDate || "",
      lastServiceMeterReading: u.lastServiceMeterReading || "",
      nextServiceDate: u.nextServiceDate || "",
      nextServiceMeterReading: u.nextServiceMeterReading || "",
      conditionNotes: u.conditionNotes || "",

      acquisitionDate: u.acquisitionDate || "",
      acquisitionCost: u.acquisitionCost || 0,
      acquisitionSource: u.acquisitionSource || "Purchased New",
      storageLocation: u.storageLocation || "Main Co-op Depot, Malaybalay",

      operatingRestrictions: u.operatingRestrictions || "",
      notes: u.notes || "",
      assignedDriver: u.assignedDriver || "Unassigned",
      driverPhone: u.driverPhone || "",
    });
    setFormErrors({});
    setUnitSaveError("");
    setCustomTypeMode(false);
    setLastSelectedType(canonicalCat);
    setActiveFormTab("basic");
    if (!drivers || drivers.length === 0) {
      fetchDrivers();
    }
    setShowAddModal(true);
  };

  // Open View Details Modal
  const openViewDetails = async (u) => {
    setViewingUnit(u);
    setDetailsLoading(true);
    setUnitDetailsData(null);
    try {
      const res = await api(`/machinery-units/${u._id || u.id || u.unitId}`);
      if (res.ok && res.data) {
        setUnitDetailsData(res.data);
      } else {
        setUnitDetailsData({ data: u, maintenanceHistory: [], bookings: [] });
      }
    } catch {
      setUnitDetailsData({ data: u, maintenanceHistory: [], bookings: [] });
    } finally {
      setDetailsLoading(false);
    }
  };

  // Open Retire Confirmation Modal
  const openRetireModal = async (u) => {
    setRetiringUnit(u);
    setRetireBlockers(null);
    setRetiringLoading(true);

    try {
      // Pre-check if any active bookings block retirement
      const todayIso = new Date().toISOString().split("T")[0];
      const res = await api(`/machinery-units/${u._id || u.id || u.unitId}`);
      if (res.ok && res.data && Array.isArray(res.data.bookings)) {
        const active = res.data.bookings.filter(
          (b) => ["Approved", "Checked-Out"].includes(b.status) && b.endDate >= todayIso
        );
        if (active.length > 0) {
          setRetireBlockers(active);
        }
      }
    } catch (err) {
      console.warn("Could not pre-check bookings:", err);
    } finally {
      setRetiringLoading(false);
    }
  };

  // Execute Retirement
  const handleConfirmRetire = async () => {
    if (!retiringUnit) return;
    setRetiringLoading(true);
    try {
      const res = await api(`/machinery-units/${retiringUnit._id || retiringUnit.id || retiringUnit.unitId}/retire`, {
        method: "PATCH",
      });

      if (res.ok) {
        setFeedback({ message: `Unit ${retiringUnit.unitId} (${retiringUnit.name}) has been retired.`, isError: false });
        setRetiringUnit(null);
        setRetireBlockers(null);
        fetchUnits();
      } else {
        setFeedback({ message: res.data?.error || "Failed to retire machinery unit.", isError: true });
      }
    } catch {
      setFeedback({ message: "Network error retiring machinery unit.", isError: true });
    } finally {
      setRetiringLoading(false);
    }
  };

  // Change Status Handlers (Operational, Under Maintenance, Retired)
  const openChangeStatusModal = (unit) => {
    setStatusModalUnit(unit);
    const cond = unit.operatingCondition || (
      unit.status === "Available" ? "Operational" :
      ["Maintenance", "Repair"].includes(unit.status) ? "Under Maintenance" : "Retired"
    );
    setSelectedStatus(cond);
    setStatusNotes(unit.conditionNotes || "");
    setStatusError("");
  };

  const handleConfirmStatusChange = async (e) => {
    if (e) e.preventDefault();
    if (!statusModalUnit) return;
    setStatusSubmitting(true);
    setStatusError("");

    try {
      const res = await api(`/machinery-units/${statusModalUnit._id || statusModalUnit.id || statusModalUnit.unitId}/status`, {
        method: "PATCH",
        body: {
          operatingCondition: selectedStatus,
          conditionNotes: statusNotes,
        },
      });

      if (res.ok) {
        setFeedback({
          message: `Machinery unit ${statusModalUnit.unitId} status updated to "${selectedStatus}".`,
          isError: false,
        });
        setStatusModalUnit(null);
        fetchUnits();
      } else {
        setStatusError(res.data?.error || res.error || "Failed to update machinery condition.");
      }
    } catch (err) {
      setStatusError(err.message || "Network error updating machinery status.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Image Upload and Canvas Optimization
  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Validate type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Invalid image type. Please select a JPEG, PNG, or WebP photo.");
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit. Please choose a smaller image.");
      return;
    }

    // Optimize image using HTML5 Canvas
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const optimizedBase64 = canvas.toDataURL("image/jpeg", 0.85);

        // Upload to server
        uploadOptimizedPhoto(optimizedBase64, file.name);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const uploadOptimizedPhoto = async (base64Data, filename) => {
    setUploadingImage(true);
    try {
      const res = await api("/machinery-units/upload-photo", {
        method: "POST",
        body: { image: base64Data, filename },
      });

      if (res.ok && res.data?.imageUrl) {
        setUnitForm((prev) => ({
          ...prev,
          imageUrl: res.data.imageUrl,
          photos: [res.data.imageUrl, ...(prev.photos || []).filter((p) => p !== res.data.imageUrl)],
        }));
      } else {
        alert(res.data?.error || "Failed to upload photo to server.");
      }
    } catch {
      alert("Error uploading machinery photo.");
    } finally {
      setUploadingImage(false);
    }
  };

  const updateUnitField = (field, value) => {
    setUnitForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (unitSaveError) setUnitSaveError("");
  };

  const handleTypeSelected = (nextType) => {
    const savedPref = getSavedPrefixForType(nextType);
    setUnitForm((prev) => ({
      ...prev,
      category: nextType,
      unitPrefix: editingUnit ? prev.unitPrefix : savedPref,
      unitId: !editingUnit ? (savedPref ? getNextUnitIdForPrefix(savedPref) : "") : prev.unitId,
    }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.category;
      delete next.unitPrefix;
      delete next.unitId;
      return next;
    });
    if (unitSaveError) setUnitSaveError("");
  };

  const handleCustomTypeInput = (rawVal) => {
    const matchedPref = getSavedPrefixForType(rawVal);
    const effectivePref = matchedPref || unitForm.unitPrefix;
    const conflict = effectivePref ? findPrefixConflict(effectivePref, rawVal) : null;

    setUnitForm((prev) => ({
      ...prev,
      category: rawVal,
      unitPrefix: matchedPref || prev.unitPrefix,
      unitId: !editingUnit
        ? matchedPref && !conflict
          ? getNextUnitIdForPrefix(matchedPref)
          : conflict
          ? ""
          : prev.unitId
        : prev.unitId,
    }));

    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.category;
      if (conflict) {
        next.unitPrefix = `Used by ${conflict}`;
      } else if (next.unitPrefix?.startsWith("Used by")) {
        delete next.unitPrefix;
      }
      return next;
    });
    if (unitSaveError) setUnitSaveError("");
  };

  const handlePrefixChange = (rawVal) => {
    const cleanPref = normalizePrefix(rawVal);
    const conflict = cleanPref ? findPrefixConflict(cleanPref, unitForm.category) : null;
    const nextId =
      !editingUnit && cleanPref && !conflict
        ? getNextUnitIdForPrefix(cleanPref)
        : !editingUnit
        ? ""
        : unitForm.unitId;

    setUnitForm((prev) => ({
      ...prev,
      unitPrefix: cleanPref,
      unitId: nextId,
    }));

    setFormErrors((prev) => {
      const next = { ...prev };
      if (conflict) {
        next.unitPrefix = `Used by ${conflict}`;
      } else {
        delete next.unitPrefix;
      }
      delete next.unitId;
      return next;
    });
    if (unitSaveError) setUnitSaveError("");
  };

  // Client-Side Validation
  const validateForm = () => {
    const errs = {};
    if (!String(unitForm.category || "").trim()) errs.category = "Required";

    if (!editingUnit) {
      const cleanPref = normalizePrefix(unitForm.unitPrefix);
      if (!cleanPref) {
        errs.unitPrefix = "Required";
      } else {
        const conflict = findPrefixConflict(cleanPref, unitForm.category);
        if (conflict) errs.unitPrefix = `Used by ${conflict}`;
      }
    }

    const cleanUnitId = unitForm.unitId.trim();
    if (!cleanUnitId) {
      errs.unitId = "Required";
    } else if (!editingUnit) {
      const dupId = units.some(
        (u) => String(u.unitId || "").trim().toUpperCase() === cleanUnitId.toUpperCase()
      );
      if (dupId) {
        errs.unitId = "Already exists";
      } else {
        const parsed = extractIdPrefixAndNum(cleanUnitId);
        if (parsed) {
          const idConflict = findPrefixConflict(parsed.prefix, unitForm.category);
          if (idConflict) errs.unitId = `Prefix used by ${idConflict}`;
        }
      }
    }

    if (!unitForm.name.trim()) errs.name = "Required";
    if (!unitForm.brand.trim()) errs.brand = "Required";
    if (!unitForm.model.trim()) errs.model = "Required";
    if (!unitForm.pricingUnit) errs.pricingUnit = "Required";

    const rate = Number(unitForm.memberRate);
    if (unitForm.memberRate === "" || isNaN(rate) || rate < 0) errs.memberRate = "Invalid rate";

    if (unitForm.nonmemberRate !== "" && Number(unitForm.nonmemberRate) < 0) {
      errs.nonmemberRate = "Invalid rate";
    }

    const minQty = Number(unitForm.minRentalQuantity);
    if (isNaN(minQty) || minQty <= 0) errs.minRentalQuantity = "Must be > 0";

    if (unitForm.horsepower !== "" && Number(unitForm.horsepower) < 0) {
      errs.horsepower = "Invalid value";
    }

    if (Number(unitForm.currentMeterReading) < 0) {
      errs.currentMeterReading = "Invalid value";
    }

    if (Number(unitForm.acquisitionCost) < 0) {
      errs.acquisitionCost = "Invalid value";
    }

    setFormErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (
        errs.unitId ||
        errs.unitPrefix ||
        errs.name ||
        errs.category ||
        errs.brand ||
        errs.model ||
        errs.pricingUnit ||
        errs.memberRate ||
        errs.nonmemberRate ||
        errs.minRentalQuantity
      ) {
        setActiveFormTab("basic");
      } else if (errs.horsepower || errs.currentMeterReading) {
        setActiveFormTab("specs");
      } else if (errs.acquisitionCost) {
        setActiveFormTab("service");
      }
      return false;
    }
    return true;
  };

  // Handle Save (Add or Edit)
  const handleSaveUnit = async (e) => {
    e.preventDefault();
    if (savingUnit) return;
    setUnitSaveError("");

    if (!validateForm()) {
      setUnitSaveError("Please check highlighted fields.");
      return;
    }

    const rawCategory = String(unitForm.category || "").trim();
    const canonicalCategory =
      availableMachineryTypes.find((t) => t.toLowerCase() === rawCategory.toLowerCase()) ||
      rawCategory;

    const payload = {
      ...unitForm,
      unitId: unitForm.unitId.trim(),
      unitPrefix: normalizePrefix(unitForm.unitPrefix),
      category: canonicalCategory,
      memberRate: Number(unitForm.memberRate),
      nonmemberRate: unitForm.nonmemberRate !== "" ? Number(unitForm.nonmemberRate) : null,
      minRentalQuantity: Number(unitForm.minRentalQuantity || 1),
      horsepower: unitForm.horsepower !== "" ? Number(unitForm.horsepower) : null,
      currentMeterReading: Number(unitForm.currentMeterReading || 0),
      acquisitionCost: Number(unitForm.acquisitionCost || 0),
      additionalOperatorFee: unitForm.operatorIncluded ? 0 : Number(unitForm.additionalOperatorFee || 0),
      additionalTransportFee: unitForm.transportIncluded ? 0 : Number(unitForm.additionalTransportFee || 0),
      attachments: typeof unitForm.attachments === "string"
        ? unitForm.attachments.split(",").map((s) => s.trim()).filter(Boolean)
        : unitForm.attachments,
    };

    try {
      setSavingUnit(true);
      if (editingUnit) {
        const res = await api(`/machinery-units/${editingUnit._id || editingUnit.id || editingUnit.unitId}`, {
          method: "PUT",
          body: payload,
        });

        if (res.ok) {
          setFeedback({ message: `Unit ${unitForm.unitId} updated.`, isError: false });
          setShowAddModal(false);
          setEditingUnit(null);
          fetchUnits();
        } else {
          setUnitSaveError(res.data?.error || "Failed to update unit.");
        }
      } else {
        const res = await api("/machinery-units", {
          method: "POST",
          body: payload,
        });

        if (res.ok) {
          if (res.data?.typePrefixes) {
            setTypePrefixes(res.data.typePrefixes);
          }
          setFeedback({ message: `Unit ${unitForm.unitId} added.`, isError: false });
          setShowAddModal(false);
          fetchUnits();
        } else {
          setUnitSaveError(res.data?.error || "Failed to register unit.");
        }
      }
    } catch {
      setUnitSaveError("Network error while saving unit.");
    } finally {
      setSavingUnit(false);
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
        <ManagerTopbar title="Units Management" />

        {/* Global Feedback Banner */}
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback({ message: "", isError: false })}
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: "700" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ================= 4 Summary Cards (Single Unified Color) ================= */}
        <div className="wz-units-kpi-row">
          {/* Card 1: Total Units */}
          <div className="wz-unit-kpi-card">
            <div className="wz-unit-kpi-info">
              <span className="wz-unit-kpi-title">Total Units</span>
              <span className="wz-unit-kpi-num">{counts.total}</span>
              <span className="wz-unit-kpi-sub">Registered fleet equipment</span>
            </div>
            <div className="wz-unit-kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
          </div>

          {/* Card 2: Operational */}
          <div className="wz-unit-kpi-card">
            <div className="wz-unit-kpi-info">
              <span className="wz-unit-kpi-title">Operational</span>
              <span className="wz-unit-kpi-num">{counts.operational}</span>
              <span className="wz-unit-kpi-sub">Ready for member rental</span>
            </div>
            <div className="wz-unit-kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>

          {/* Card 3: Under Maintenance */}
          <div className="wz-unit-kpi-card">
            <div className="wz-unit-kpi-info">
              <span className="wz-unit-kpi-title">Under Maintenance</span>
              <span className="wz-unit-kpi-num">{counts.underMaintenance}</span>
              <span className="wz-unit-kpi-sub">Servicing &amp; workshop repair</span>
            </div>
            <div className="wz-unit-kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
          </div>

          {/* Card 4: Retired */}
          <div className="wz-unit-kpi-card">
            <div className="wz-unit-kpi-info">
              <span className="wz-unit-kpi-title">Retired</span>
              <span className="wz-unit-kpi-num">{counts.retired}</span>
              <span className="wz-unit-kpi-sub">Archived / Decommissioned</span>
            </div>
            <div className="wz-unit-kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
          </div>
        </div>

        {/* ================= Units Toolbar & Action Bar ================= */}
        <div className="wz-units-toolbar">
          <div className="wz-units-left-filters">
            <ManagerSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              placeholder="Search asset code, name, brand, model, serial..."
              filters={[
                {
                  id: "machineryType",
                  label: "Machinery Type",
                  value: filterType,
                  defaultValue: "All",
                  onChange: setFilterType,
                  options: [
                    { value: "All", label: "All Machinery Types" },
                    ...availableMachineryTypes.map((t) => ({ value: t, label: t })),
                  ],
                },
                {
                  id: "condition",
                  label: "Operating Condition",
                  value: filterCondition,
                  defaultValue: "All",
                  onChange: setFilterCondition,
                  options: [
                    { value: "All", label: "All Conditions" },
                    ...OPERATING_CONDITIONS.map((c) => ({ value: c, label: c })),
                  ],
                },
              ]}
              sort={{
                value: sortBy,
                defaultValue: "newest",
                onChange: setSortBy,
                options: [
                  { value: "newest", label: "Newest First" },
                  { value: "oldest", label: "Oldest First" },
                  { value: "name_asc", label: "Name (A-Z)" },
                  { value: "name_desc", label: "Name (Z-A)" },
                  { value: "rate_asc", label: "Rate (Low to High)" },
                  { value: "rate_desc", label: "Rate (High to Low)" },
                ],
              }}
            />
          </div>

          <div className="wz-units-right-actions">
            {/* View Mode Toggle (Table / Grid) */}
            <div className="wz-view-toggle">
              <button
                className={`wz-view-btn ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
                title="Table View"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button
                className={`wz-view-btn ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => setViewMode("grid")}
                title="Card Grid View"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
            </div>

            {/* Add Unit Button */}
            <button
              className="wz-btn-add-unit"
              onClick={openAddModal}
            >
              + Add Unit
            </button>
          </div>
        </div>

        {/* ================= Primary Content: Table or Grid View ================= */}
        {loading ? (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid var(--wz-border)",
              borderRadius: "16px",
              padding: "60px 24px",
              textAlign: "center",
              color: "#64748b",
            }}
          >
            Loading machinery fleet units...
          </div>
        ) : filteredUnits.length === 0 ? (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid var(--wz-border)",
              borderRadius: "16px",
              padding: "60px 24px",
              textAlign: "center",
              color: "#64748b",
            }}
          >
            <div style={{ fontSize: "1.8rem", marginBottom: "8px" }}>🚜</div>
            <h3 style={{ margin: "0 0 6px 0", color: "#0f172a", fontSize: "1.1rem" }}>No machinery units found</h3>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              No units matched your filter or search query. Try clearing your search or adding a new unit.
            </p>
          </div>
        ) : viewMode === "table" ? (
          /* ================= Primary Table View ================= */
          <div className="wz-table-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="wz-table-responsive">
              <table className="wz-table">
                <thead>
                  <tr>
                    <th>Asset Code</th>
                    <th>Machinery Name</th>
                    <th>Type</th>
                    <th>Rental Rate</th>
                    <th>Assigned Driver</th>
                    <th>Operating Condition</th>
                    <th style={{ textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUnits.map((u) => {
                    const cond = u.operatingCondition || (
                      u.status === "Available" ? "Operational" :
                      ["Maintenance", "Repair"].includes(u.status) ? "Under Maintenance" : "Retired"
                    );

                    return (
                      <tr key={u._id || u.id || u.unitId}>
                        {/* 1. Asset Code */}
                        <td>
                          <span className="wz-unit-code-badge">{u.unitId}</span>
                        </td>

                        {/* 2. Machinery Name + Photo */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <img
                              src={u.imageUrl || "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=150&q=80"}
                              alt={u.name}
                              style={{ width: "36px", height: "36px", borderRadius: "6px", objectFit: "cover" }}
                            />
                            <div>
                              <div style={{ fontWeight: "700", color: "#0f172a" }}>{u.name}</div>
                              {u.serialNumber && (
                                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>S/N: {u.serialNumber}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 3. Type (Category) */}
                        <td>
                          <span style={{ fontSize: "0.82rem", fontWeight: "600", color: "#334155" }}>
                            {u.category}
                          </span>
                        </td>

                        {/* 4. Rental Rate */}
                        <td>
                          <div style={{ fontWeight: "700", color: "#0f172a" }}>
                            ₱{Number(u.memberRate !== undefined ? u.memberRate : u.ratePerDay).toLocaleString()}
                            <span style={{ fontSize: "0.75rem", fontWeight: "500", color: "#64748b" }}>
                              {" "}
                              {u.pricingUnit === "Per Hectare" ? "/hec" : u.pricingUnit === "Per Hour" ? "/hr" : "/day"}
                            </span>
                          </div>
                          {u.nonmemberRate && (
                            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                              Non-member: ₱{Number(u.nonmemberRate).toLocaleString()}
                            </div>
                          )}
                        </td>

                        {/* 5. Assigned Driver */}
                        <td>
                          {u.assignedDriver && u.assignedDriver !== "Unassigned" ? (
                            <div>
                              <div style={{ fontWeight: "700", color: "#0f172a", fontSize: "0.86rem" }}>
                                {u.assignedDriver}
                              </div>
                              {u.driverPhone && (
                                <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                  {u.driverPhone}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.82rem" }}>
                              Unassigned
                            </span>
                          )}
                        </td>

                        {/* 6. Operating Condition (No Dot) */}
                        <td>
                          {cond === "Operational" ? (
                            <span className="wz-cond-badge wz-cond-operational">
                              Operational
                            </span>
                          ) : cond === "Under Maintenance" ? (
                            <span className="wz-cond-badge wz-cond-maintenance">
                              Under Maintenance
                            </span>
                          ) : (
                            <span className="wz-cond-badge wz-cond-retired">
                              Retired
                            </span>
                          )}
                        </td>

                        {/* 7. Actions: ONLY Icon Buttons */}
                        <td>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                            {/* 1. View Icon Button */}
                            <button
                              className="wz-action-icon-btn view"
                              onClick={() => openViewDetails(u)}
                              title="View Details"
                              aria-label="View Details"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>

                            {/* 2. Change Status Icon Button (Operational, Maintenance, Retire) */}
                            <button
                              className="wz-action-icon-btn status"
                              onClick={() => openChangeStatusModal(u)}
                              title="Change Status (Operational, Maintenance, Retire)"
                              aria-label="Change Status"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ================= Optional Card Grid View ================= */
          <div className="wz-units-container">
            {paginatedUnits.map((u) => {
              const cond = u.operatingCondition || (
                u.status === "Available" ? "Operational" :
                ["Maintenance", "Repair"].includes(u.status) ? "Under Maintenance" : "Retired"
              );

              return (
                <div key={u._id || u.id || u.unitId} className="wz-unit-row-card">
                  {/* Photo */}
                  <div className="wz-unit-thumb-wrap">
                    <img
                      src={u.imageUrl || "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=700&q=80"}
                      alt={u.name}
                      className="wz-unit-thumb"
                    />
                  </div>

                  {/* Brand & Name */}
                  <div className="wz-unit-col-brand">
                    <span className="wz-unit-code-badge" style={{ marginBottom: "4px" }}>{u.unitId}</span>
                    <span className="wz-unit-brand-name">{u.brand}</span>
                    <h3 className="wz-unit-model-title">{u.name}</h3>
                    <div style={{ marginTop: "4px" }}>
                      {cond === "Operational" ? (
                        <span className="wz-cond-badge wz-cond-operational">Operational</span>
                      ) : cond === "Under Maintenance" ? (
                        <span className="wz-cond-badge wz-cond-maintenance">Under Maintenance</span>
                      ) : (
                        <span className="wz-cond-badge wz-cond-retired">Retired</span>
                      )}
                    </div>
                  </div>

                  {/* Specs: Type */}
                  <div className="wz-unit-col-spec">
                    <span className="wz-unit-spec-label">Type</span>
                    <span className="wz-unit-spec-value">{u.category}</span>
                  </div>

                  {/* Specs: Meter */}
                  <div className="wz-unit-col-spec">
                    <span className="wz-unit-spec-label">Meter</span>
                    <span className="wz-unit-spec-value">{u.currentMeterReading || u.operatingHours || 0} {u.meterReadingUnit || "hrs"}</span>
                  </div>

                  {/* Price */}
                  <div className="wz-unit-col-price">
                    <span className="wz-unit-price-label">Rental Rate</span>
                    <div>
                      <span className="wz-unit-price-val">₱{Number(u.memberRate || u.ratePerDay).toLocaleString()}</span>
                      <span className="wz-unit-price-unit"> {u.pricingUnit === "Per Hectare" ? "/hec" : u.pricingUnit === "Per Hour" ? "/hr" : "/day"}</span>
                    </div>
                  </div>

                  {/* Assigned Driver */}
                  <div className="wz-unit-col-spec" style={{ minWidth: "130px" }}>
                    <span className="wz-unit-spec-label">Assigned Driver</span>
                    <div
                      className="wz-unit-spec-val"
                      style={{
                        fontWeight: "700",
                        color: u.assignedDriver && u.assignedDriver !== "Unassigned" ? "#0f172a" : "#94a3b8",
                        fontStyle: u.assignedDriver && u.assignedDriver !== "Unassigned" ? "normal" : "italic",
                      }}
                    >
                      {u.assignedDriver && u.assignedDriver !== "Unassigned" ? u.assignedDriver : "Unassigned"}
                    </div>
                  </div>

                  {/* Actions: ONLY Icon Buttons */}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      className="wz-action-icon-btn view"
                      onClick={() => openViewDetails(u)}
                      title="View Details"
                      aria-label="View Details"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                    <button
                      className="wz-action-icon-btn status"
                      onClick={() => openChangeStatusModal(u)}
                      title="Change Status (Operational, Maintenance, Retire)"
                      aria-label="Change Status"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================= Bottom Pagination Footer ================= */}
        <div className="wz-table-footer" style={{ marginTop: "24px" }}>
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
              Showing {filteredUnits.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filteredUnits.length)} of {filteredUnits.length} units
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
      </main>

      {/* ================= 1. Add / Edit Unit Modal (Minimalist 3-Tab Layout) ================= */}
      {showAddModal && (
        <div className="wz-booking-modal-overlay" onClick={() => !savingUnit && setShowAddModal(false)}>
          <div
            className="wz-booking-modal-container wz-unit-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="wz-booking-modal-header">
              <div className="wz-unit-modal-title-row">
                <h3 className="wz-unit-modal-title">
                  {editingUnit ? "Edit Unit" : "Register Unit"}
                </h3>
                <span className={`wz-unit-modal-pill ${editingUnit ? "is-edit" : "is-new"}`}>
                  {editingUnit ? unitForm.unitId : "NEW"}
                </span>
              </div>
              <button
                type="button"
                className="wz-unit-modal-close"
                disabled={savingUnit}
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* 3-Tab Switcher */}
            <div className="wz-modal-tab-bar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeFormTab === "basic"}
                className={`wz-modal-tab-btn ${activeFormTab === "basic" ? "active" : ""}`}
                onClick={() => setActiveFormTab("basic")}
              >
                <span>Unit &amp; Rate</span>
                {(formErrors.unitId ||
                  formErrors.unitPrefix ||
                  formErrors.name ||
                  formErrors.category ||
                  formErrors.brand ||
                  formErrors.model ||
                  formErrors.pricingUnit ||
                  formErrors.memberRate ||
                  formErrors.nonmemberRate ||
                  formErrors.minRentalQuantity) && <span className="wz-unit-tab-dot" />}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeFormTab === "specs"}
                className={`wz-modal-tab-btn ${activeFormTab === "specs" ? "active" : ""}`}
                onClick={() => setActiveFormTab("specs")}
              >
                <span>Specs &amp; Notes</span>
                {(formErrors.horsepower || formErrors.currentMeterReading) && (
                  <span className="wz-unit-tab-dot" />
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeFormTab === "service"}
                className={`wz-modal-tab-btn ${activeFormTab === "service" ? "active" : ""}`}
                onClick={() => setActiveFormTab("service")}
              >
                <span>Service &amp; Asset</span>
                {formErrors.acquisitionCost && <span className="wz-unit-tab-dot" />}
              </button>
            </div>

            {/* Form */}
            <form
              noValidate
              onSubmit={handleSaveUnit}
              style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            >
              <div className="wz-unit-modal-body">
                {activeFormTab === "basic" && (
                  <>
                    {/* Photo + Code + Name */}
                    <div className="wz-unit-photo-row">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        onChange={handleFileChange}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        className={`wz-unit-photo-box ${unitForm.imageUrl ? "has-photo" : ""}`}
                        onClick={() => !uploadingImage && fileInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (!uploadingImage) fileInputRef.current?.click();
                          }
                        }}
                        title="Upload photo"
                      >
                        {unitForm.imageUrl ? (
                          <>
                            <img src={unitForm.imageUrl} alt="Unit" />
                            <button
                              type="button"
                              className="wz-unit-photo-remove"
                              aria-label="Remove photo"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUnitForm((prev) => ({
                                  ...prev,
                                  imageUrl: "",
                                  photos: (prev.photos || []).filter((p) => p !== prev.imageUrl),
                                }));
                                if (fileInputRef.current) fileInputRef.current.value = "";
                              }}
                            >
                              &times;
                            </button>
                          </>
                        ) : (
                          <>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="3" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span>{uploadingImage ? "Uploading..." : "Add Photo"}</span>
                          </>
                        )}
                      </div>

                      <div className="wz-unit-identity-fields">
                        <div className="wz-unit-identity-top">
                          <div className="wz-unit-field">
                            <label className="wz-unit-label">
                              Type <span className="req">*</span>
                            </label>
                            {customTypeMode ? (
                              <div className="wz-unit-combo">
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="New type"
                                  value={unitForm.category}
                                  onChange={(e) => handleCustomTypeInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleTypeSelected(
                                        lastSelectedType || modalMachineryTypes[0] || "Tractor"
                                      );
                                      setCustomTypeMode(false);
                                    }
                                  }}
                                  className={`wz-unit-input ${formErrors.category ? "is-error" : ""}`}
                                />
                                <button
                                  type="button"
                                  className="wz-unit-type-toggle"
                                  title="Select existing type"
                                  aria-label="Select existing type"
                                  onClick={() => {
                                    const trimmed = String(unitForm.category || "").trim();
                                    const matched = modalMachineryTypes.find(
                                      (t) => t.toLowerCase() === trimmed.toLowerCase()
                                    );
                                    handleTypeSelected(
                                      matched || lastSelectedType || modalMachineryTypes[0] || "Tractor"
                                    );
                                    setCustomTypeMode(false);
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <select
                                value={unitForm.category}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "__NEW_TYPE__") {
                                    setLastSelectedType(
                                      unitForm.category || modalMachineryTypes[0] || "Tractor"
                                    );
                                    setUnitForm((prev) => ({
                                      ...prev,
                                      category: "",
                                      unitPrefix: "",
                                      unitId: "",
                                    }));
                                    setFormErrors((prev) => {
                                      const next = { ...prev };
                                      delete next.category;
                                      delete next.unitPrefix;
                                      delete next.unitId;
                                      return next;
                                    });
                                    setCustomTypeMode(true);
                                  } else {
                                    setLastSelectedType(val);
                                    handleTypeSelected(val);
                                  }
                                }}
                                className={`wz-unit-select ${formErrors.category ? "is-error" : ""}`}
                              >
                                {modalMachineryTypes.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                                <option value="__NEW_TYPE__">+ New type...</option>
                              </select>
                            )}
                            {formErrors.category && <span className="wz-unit-error">{formErrors.category}</span>}
                          </div>

                          <div className="wz-unit-field">
                            <label className="wz-unit-label">
                              Prefix <span className="req">*</span>
                            </label>
                            <input
                              type="text"
                              maxLength={8}
                              disabled={
                                Boolean(editingUnit) ||
                                (Boolean(getSavedPrefixForType(unitForm.category)) &&
                                  hasExistingUnitsForType(unitForm.category))
                              }
                              placeholder="TR"
                              value={unitForm.unitPrefix}
                              onChange={(e) => handlePrefixChange(e.target.value)}
                              className={`wz-unit-input wz-unit-prefix-input ${formErrors.unitPrefix ? "is-error" : ""}`}
                            />
                            {formErrors.unitPrefix && <span className="wz-unit-error">{formErrors.unitPrefix}</span>}
                          </div>

                          <div className="wz-unit-field">
                            <label className="wz-unit-label">
                              Unit ID <span className="req">*</span>
                            </label>
                            <input
                              type="text"
                              disabled={Boolean(editingUnit)}
                              placeholder="TR-001"
                              value={unitForm.unitId}
                              onChange={(e) => updateUnitField("unitId", e.target.value)}
                              className={`wz-unit-input ${formErrors.unitId ? "is-error" : ""}`}
                            />
                            {formErrors.unitId && <span className="wz-unit-error">{formErrors.unitId}</span>}
                          </div>
                        </div>

                        <div className="wz-unit-grid-2">
                          <div className="wz-unit-field">
                            <label className="wz-unit-label">
                              Unit Name <span className="req">*</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Utility Tractor"
                              value={unitForm.name}
                              onChange={(e) => updateUnitField("name", e.target.value)}
                              className={`wz-unit-input ${formErrors.name ? "is-error" : ""}`}
                            />
                            {formErrors.name && <span className="wz-unit-error">{formErrors.name}</span>}
                          </div>

                          <div className="wz-unit-field">
                            <label className="wz-unit-label">Photo URL</label>
                            <input
                              type="text"
                              placeholder="Optional URL"
                              value={unitForm.imageUrl}
                              onChange={(e) => updateUnitField("imageUrl", e.target.value)}
                              className="wz-unit-input"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Brand, Model, Status */}
                    <div className="wz-unit-grid-3">
                      <div className="wz-unit-field">
                        <label className="wz-unit-label">
                          Brand <span className="req">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Kubota"
                          value={unitForm.brand}
                          onChange={(e) => updateUnitField("brand", e.target.value)}
                          className={`wz-unit-input ${formErrors.brand ? "is-error" : ""}`}
                        />
                        {formErrors.brand && <span className="wz-unit-error">{formErrors.brand}</span>}
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">
                          Model <span className="req">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="L4508"
                          value={unitForm.model}
                          onChange={(e) => updateUnitField("model", e.target.value)}
                          className={`wz-unit-input ${formErrors.model ? "is-error" : ""}`}
                        />
                        {formErrors.model && <span className="wz-unit-error">{formErrors.model}</span>}
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">
                          Status <span className="req">*</span>
                        </label>
                        <select
                          value={unitForm.operatingCondition}
                          onChange={(e) => updateUnitField("operatingCondition", e.target.value)}
                          className="wz-unit-select"
                        >
                          {OPERATING_CONDITIONS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="wz-unit-section-divider">
                      <div className="wz-unit-grid-3">
                        <div className="wz-unit-field">
                          <label className="wz-unit-label">
                            Billing <span className="req">*</span>
                          </label>
                          <select
                            value={unitForm.pricingUnit}
                            onChange={(e) => updateUnitField("pricingUnit", e.target.value)}
                            className="wz-unit-select"
                          >
                            {PRICING_UNITS.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </div>

                        <div className="wz-unit-field">
                          <label className="wz-unit-label">
                            Member (₱) <span className="req">*</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="2800"
                            value={unitForm.memberRate}
                            onChange={(e) => updateUnitField("memberRate", e.target.value)}
                            className={`wz-unit-input ${formErrors.memberRate ? "is-error" : ""}`}
                          />
                          {formErrors.memberRate && <span className="wz-unit-error">{formErrors.memberRate}</span>}
                        </div>

                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Non-Member (₱)</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="3500"
                            value={unitForm.nonmemberRate}
                            onChange={(e) => updateUnitField("nonmemberRate", e.target.value)}
                            className={`wz-unit-input ${formErrors.nonmemberRate ? "is-error" : ""}`}
                          />
                          {formErrors.nonmemberRate && <span className="wz-unit-error">{formErrors.nonmemberRate}</span>}
                        </div>
                      </div>

                      <div className="wz-unit-grid-2">
                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Operator</label>
                          <select
                            value={unitForm.assignedDriver || "Unassigned"}
                            onChange={(e) => {
                              const val = e.target.value;
                              const match = drivers.find((d) => d.name === val);
                              setUnitForm((prev) => ({
                                ...prev,
                                assignedDriver: val,
                                driverPhone: match ? (match.phone || "") : "",
                              }));
                            }}
                            className="wz-unit-select"
                          >
                            <option value="Unassigned">Unassigned</option>
                            {drivers.map((d) => (
                              <option key={d._id || d.id || d.name} value={d.name}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Min. Qty</label>
                          <input
                            type="number"
                            min="0.1"
                            step="0.5"
                            placeholder="1"
                            value={unitForm.minRentalQuantity}
                            onChange={(e) => updateUnitField("minRentalQuantity", e.target.value)}
                            className={`wz-unit-input ${formErrors.minRentalQuantity ? "is-error" : ""}`}
                          />
                          {formErrors.minRentalQuantity && (
                            <span className="wz-unit-error">{formErrors.minRentalQuantity}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inclusions & Conditional Add-on Fees */}
                    <div className="wz-unit-section-divider">
                      <span className="wz-unit-eyebrow">Rate Options</span>
                      <div className="wz-unit-toggle-grid">
                        {[
                          { key: "operatorRequired", label: "Operator Required" },
                          { key: "operatorIncluded", label: "Operator Included" },
                          { key: "fuelIncluded", label: "Fuel Included" },
                          { key: "transportIncluded", label: "Transport Included" },
                        ].map((opt) => {
                          const active = Boolean(unitForm[opt.key]);
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              aria-pressed={active}
                              className={`wz-unit-toggle-pill ${active ? "active" : ""}`}
                              onClick={() => updateUnitField(opt.key, !active)}
                            >
                              {active && (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {(!unitForm.operatorIncluded || !unitForm.transportIncluded) && (
                        <div className="wz-unit-grid-2">
                          {!unitForm.operatorIncluded && (
                            <div className="wz-unit-field">
                              <label className="wz-unit-label">Operator Fee (₱)</label>
                              <div className="wz-unit-combo">
                                <input
                                  type="number"
                                  min="0"
                                  step="50"
                                  placeholder="0"
                                  value={unitForm.additionalOperatorFee}
                                  onChange={(e) => updateUnitField("additionalOperatorFee", e.target.value)}
                                  className="wz-unit-input"
                                />
                                <select
                                  value={unitForm.operatorFeeBasis}
                                  onChange={(e) => updateUnitField("operatorFeeBasis", e.target.value)}
                                  className="wz-unit-select"
                                >
                                  {FEE_BASIS_OPTIONS.map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}

                          {!unitForm.transportIncluded && (
                            <div className="wz-unit-field">
                              <label className="wz-unit-label">Transport Fee (₱)</label>
                              <div className="wz-unit-combo">
                                <input
                                  type="number"
                                  min="0"
                                  step="50"
                                  placeholder="0"
                                  value={unitForm.additionalTransportFee}
                                  onChange={(e) => updateUnitField("additionalTransportFee", e.target.value)}
                                  className="wz-unit-input"
                                />
                                <select
                                  value={unitForm.transportFeeBasis}
                                  onChange={(e) => updateUnitField("transportFeeBasis", e.target.value)}
                                  className="wz-unit-select"
                                >
                                  {FEE_BASIS_OPTIONS.map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeFormTab === "specs" && (
                  <>
                    <div className="wz-unit-grid-3">
                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Power (HP)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="75"
                          value={unitForm.horsepower}
                          onChange={(e) => updateUnitField("horsepower", e.target.value)}
                          className={`wz-unit-input ${formErrors.horsepower ? "is-error" : ""}`}
                        />
                        {formErrors.horsepower && <span className="wz-unit-error">{formErrors.horsepower}</span>}
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Fuel</label>
                        <select
                          value={unitForm.fuelType}
                          onChange={(e) => updateUnitField("fuelType", e.target.value)}
                          className="wz-unit-select"
                        >
                          {FUEL_TYPES.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Year</label>
                        <input
                          type="text"
                          placeholder="2024"
                          value={unitForm.modelYear}
                          onChange={(e) => updateUnitField("modelYear", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>
                    </div>

                    <div className="wz-unit-grid-2">
                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Serial No.</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={unitForm.serialNumber}
                          onChange={(e) => updateUnitField("serialNumber", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Capacity</label>
                        <input
                          type="text"
                          placeholder="e.g. 600L tank"
                          value={unitForm.capacity}
                          onChange={(e) => updateUnitField("capacity", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>
                    </div>

                    <div className="wz-unit-grid-2">
                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Depot</label>
                        <input
                          type="text"
                          placeholder="Main Co-op Depot"
                          value={unitForm.storageLocation}
                          onChange={(e) => updateUnitField("storageLocation", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Meter Reading</label>
                        <div className="wz-unit-combo">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            value={unitForm.currentMeterReading}
                            onChange={(e) => updateUnitField("currentMeterReading", e.target.value)}
                            className={`wz-unit-input ${formErrors.currentMeterReading ? "is-error" : ""}`}
                          />
                          <select
                            value={unitForm.meterReadingUnit}
                            onChange={(e) => updateUnitField("meterReadingUnit", e.target.value)}
                            className="wz-unit-select"
                          >
                            <option value="Hours">Hours</option>
                            <option value="Kilometers">Kilometers</option>
                            <option value="Hectares">Hectares</option>
                          </select>
                        </div>
                        {formErrors.currentMeterReading && (
                          <span className="wz-unit-error">{formErrors.currentMeterReading}</span>
                        )}
                      </div>
                    </div>

                    <div className="wz-unit-field">
                      <label className="wz-unit-label">Attachments</label>
                      <input
                        type="text"
                        placeholder="Disc plough, rotary tiller (comma-separated)"
                        value={unitForm.attachments}
                        onChange={(e) => updateUnitField("attachments", e.target.value)}
                        className="wz-unit-input"
                      />
                    </div>

                    <div className="wz-unit-section-divider">
                      <div className="wz-unit-grid-2">
                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Restrictions</label>
                          <textarea
                            rows="2"
                            placeholder="Usage limits (optional)"
                            value={unitForm.operatingRestrictions}
                            onChange={(e) => updateUnitField("operatingRestrictions", e.target.value)}
                            className="wz-unit-textarea"
                          />
                        </div>

                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Internal Notes</label>
                          <textarea
                            rows="2"
                            placeholder="Staff notes (optional)"
                            value={unitForm.notes}
                            onChange={(e) => updateUnitField("notes", e.target.value)}
                            className="wz-unit-textarea"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeFormTab === "service" && (
                  <>
                    <span className="wz-unit-eyebrow">Service Schedule</span>
                    <div className="wz-unit-grid-2">
                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Last Service Date</label>
                        <input
                          type="date"
                          value={unitForm.lastServiceDate}
                          onChange={(e) => updateUnitField("lastServiceDate", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Last Service Meter</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={unitForm.lastServiceMeterReading}
                          onChange={(e) => updateUnitField("lastServiceMeterReading", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>
                    </div>

                    <div className="wz-unit-grid-2">
                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Next Service Date</label>
                        <input
                          type="date"
                          value={unitForm.nextServiceDate}
                          onChange={(e) => updateUnitField("nextServiceDate", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>

                      <div className="wz-unit-field">
                        <label className="wz-unit-label">Next Service Meter</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={unitForm.nextServiceMeterReading}
                          onChange={(e) => updateUnitField("nextServiceMeterReading", e.target.value)}
                          className="wz-unit-input"
                        />
                      </div>
                    </div>

                    <div className="wz-unit-field">
                      <label className="wz-unit-label">Service Notes</label>
                      <textarea
                        rows="2"
                        placeholder="Workshop remarks (optional)"
                        value={unitForm.conditionNotes}
                        onChange={(e) => updateUnitField("conditionNotes", e.target.value)}
                        className="wz-unit-textarea"
                      />
                    </div>

                    <div className="wz-unit-section-divider">
                      <span className="wz-unit-eyebrow">Ownership</span>
                      <div className="wz-unit-grid-3">
                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Acquired Date</label>
                          <input
                            type="date"
                            value={unitForm.acquisitionDate}
                            onChange={(e) => updateUnitField("acquisitionDate", e.target.value)}
                            className="wz-unit-input"
                          />
                        </div>

                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Cost (₱)</label>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            placeholder="0"
                            value={unitForm.acquisitionCost}
                            onChange={(e) => updateUnitField("acquisitionCost", e.target.value)}
                            className={`wz-unit-input ${formErrors.acquisitionCost ? "is-error" : ""}`}
                          />
                          {formErrors.acquisitionCost && (
                            <span className="wz-unit-error">{formErrors.acquisitionCost}</span>
                          )}
                        </div>

                        <div className="wz-unit-field">
                          <label className="wz-unit-label">Source</label>
                          <select
                            value={unitForm.acquisitionSource}
                            onChange={(e) => updateUnitField("acquisitionSource", e.target.value)}
                            className="wz-unit-select"
                          >
                            {ACQUISITION_SOURCES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="wz-booking-modal-footer">
                <div style={{ fontSize: "0.78rem", color: unitSaveError ? "#e11d48" : "#64748b", fontWeight: unitSaveError ? 600 : 500 }}>
                  {unitSaveError ? (
                    unitSaveError
                  ) : (
                    <>
                      <span style={{ color: "#e11d48", fontWeight: 700 }}>*</span> Required
                    </>
                  )}
                </div>

                <div className="wz-modal-footer-actions">
                  <button
                    type="button"
                    disabled={savingUnit}
                    onClick={() => setShowAddModal(false)}
                    className="wz-modal-btn-close"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={savingUnit}
                    className="wz-modal-btn-save wz-unit-btn-save"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {savingUnit ? "Saving..." : editingUnit ? "Update Unit" : "Save Unit"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 2. View Details Modal ================= */}
      {viewingUnit && (
        <div className="wz-modal-overlay" onClick={() => setViewingUnit(null)}>
          <div className="wz-modal-content wz-modal-large" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="wz-unit-code-badge" style={{ fontSize: "1rem" }}>{viewingUnit.unitId}</span>
                <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: "800", color: "#0f172a" }}>
                  {viewingUnit.name}
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    const target = (unitDetailsData && unitDetailsData.data) ? { ...viewingUnit, ...unitDetailsData.data } : viewingUnit;
                    setViewingUnit(null);
                    openEditModal(target);
                  }}
                  title="Edit Unit"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "700",
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    transition: "background 0.15s ease"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#0369a1")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#0284c7")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>Edit Unit</span>
                </button>
                <button
                  onClick={() => setViewingUnit(null)}
                  style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}
                  title="Close"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
            </div>

            {detailsLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading full unit history...</div>
            ) : (
              <div>
                {/* Hero Summary Header */}
                <div style={{ display: "flex", gap: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", marginBottom: "18px", flexWrap: "wrap" }}>
                  <img
                    src={viewingUnit.imageUrl || "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=700&q=80"}
                    alt={viewingUnit.name}
                    style={{ width: "130px", height: "95px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#0f172a" }}>
                        {viewingUnit.brand} {viewingUnit.model}
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>({viewingUnit.category})</span>
                    </div>

                    <div style={{ fontSize: "1.1rem", fontWeight: "800", color: "var(--wz-primary-red)", margin: "4px 0" }}>
                      ₱{Number(viewingUnit.memberRate || viewingUnit.ratePerDay).toLocaleString()}
                      <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "500" }}>
                        {" "}{viewingUnit.pricingUnit || "Per Hectare"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "12px", fontSize: "0.8rem", color: "#475569", flexWrap: "wrap", marginTop: "6px" }}>
                      <span>Meter: <strong>{viewingUnit.currentMeterReading || viewingUnit.operatingHours || 0} {viewingUnit.meterReadingUnit || "hrs"}</strong></span>
                      <span>Fuel: <strong>{viewingUnit.fuelType || "Diesel"}</strong></span>
                      {viewingUnit.horsepower && <span>Power: <strong>{viewingUnit.horsepower} HP</strong></span>}
                      {viewingUnit.serialNumber && <span>S/N: <strong>{viewingUnit.serialNumber}</strong></span>}
                    </div>
                  </div>
                </div>

                {/* Section 1: Brand & Model Details (Transferred to View Action) */}
                <div className="wz-detail-section">
                  <div className="wz-detail-sec-title">Brand &amp; Model Specifications</div>
                  <div className="wz-detail-grid-2">
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Brand</span>
                      <span className="wz-detail-value" style={{ fontWeight: "700", color: "#0f172a" }}>{viewingUnit.brand || "—"}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Model</span>
                      <span className="wz-detail-value" style={{ fontWeight: "700", color: "#0f172a" }}>{viewingUnit.model || "—"}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Model Year</span>
                      <span className="wz-detail-value">{viewingUnit.modelYear || "—"}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Serial Number (S/N)</span>
                      <span className="wz-detail-value">{viewingUnit.serialNumber || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Specifications & Pricing */}
                <div className="wz-detail-section">
                  <div className="wz-detail-sec-title">Rental &amp; Pricing Policies</div>
                  <div className="wz-detail-grid-2">
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Member Rental Rate</span>
                      <span className="wz-detail-value">₱{Number(viewingUnit.memberRate || viewingUnit.ratePerDay).toLocaleString()} / {viewingUnit.pricingUnit}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Non-Member Rate</span>
                      <span className="wz-detail-value">{viewingUnit.nonmemberRate ? `₱${Number(viewingUnit.nonmemberRate).toLocaleString()}` : "Not configured"}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Operator Policy</span>
                      <span className="wz-detail-value">
                        {viewingUnit.operatorIncluded ? "Included in base rate" : viewingUnit.additionalOperatorFee ? `+₱${viewingUnit.additionalOperatorFee} (${viewingUnit.operatorFeeBasis || "per day"})` : "Self-operated"}
                      </span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Transport Delivery</span>
                      <span className="wz-detail-value">
                        {viewingUnit.transportIncluded ? "Included in base rate" : viewingUnit.additionalTransportFee ? `+₱${viewingUnit.additionalTransportFee} (${viewingUnit.transportFeeBasis || "per trip"})` : "Member pickup"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Assigned Operator / Driver (Normal Black Styling) */}
                <div className="wz-detail-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div className="wz-detail-sec-title" style={{ margin: 0 }}>Assigned Operator / Driver</div>
                    <button
                      type="button"
                      onClick={() => {
                        const target = viewingUnit;
                        setViewingUnit(null);
                        openChangeDriverModal(target);
                      }}
                      style={{
                        padding: "5px 12px",
                        background: "#0f172a",
                        border: "1px solid #0f172a",
                        borderRadius: "6px",
                        color: "#ffffff",
                        fontWeight: "700",
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px"
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Change Driver
                    </button>
                  </div>
                  <div className="wz-detail-grid-2">
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Designated Driver</span>
                      <span className="wz-detail-value" style={{ fontWeight: "700", color: "#0f172a" }}>
                        {viewingUnit.assignedDriver && viewingUnit.assignedDriver !== "Unassigned" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: "700" }}>
                              {viewingUnit.assignedDriver.charAt(0).toUpperCase()}
                            </span>
                            {viewingUnit.assignedDriver}
                          </span>
                        ) : (
                          <span style={{ color: "#64748b" }}>Unassigned (No Operator Assigned)</span>
                        )}
                      </span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Driver Contact Phone</span>
                      <span className="wz-detail-value">{viewingUnit.driverPhone || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Section 4 & 5: Maintenance & Location */}
                <div className="wz-detail-section">
                  <div className="wz-detail-sec-title">Condition &amp; Service Tracking</div>
                  <div className="wz-detail-grid-2">
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Operating Condition</span>
                      <span className="wz-detail-value">{viewingUnit.operatingCondition || viewingUnit.status}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Storage Location</span>
                      <span className="wz-detail-value">{viewingUnit.storageLocation || "Main Co-op Depot"}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Last Service Date</span>
                      <span className="wz-detail-value">{viewingUnit.lastServiceDate || "None on record"}</span>
                    </div>
                    <div className="wz-detail-item">
                      <span className="wz-detail-label">Next Service Due</span>
                      <span className="wz-detail-value">{viewingUnit.nextServiceDate || "Routine"}</span>
                    </div>
                  </div>
                </div>

                {/* Related Maintenance Records */}
                {unitDetailsData && unitDetailsData.maintenanceHistory && unitDetailsData.maintenanceHistory.length > 0 && (
                  <div className="wz-detail-section">
                    <div className="wz-detail-sec-title">Service &amp; Maintenance Logs ({unitDetailsData.maintenanceHistory.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {unitDetailsData.maintenanceHistory.slice(0, 4).map((m) => (
                        <div key={m._id} style={{ display: "flex", justifyContent: "space-between", background: "#fff", border: "1px solid #e2e8f0", padding: "8px 12px", borderRadius: "6px", fontSize: "0.82rem" }}>
                          <div>
                            <strong>{m.maintenanceType}</strong> — <span style={{ color: "#64748b" }}>{m.reason}</span>
                          </div>
                          <span style={{ color: "#0284c7", fontWeight: "600" }}>{m.startDate} to {m.endDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  const target = (unitDetailsData && unitDetailsData.data) ? { ...viewingUnit, ...unitDetailsData.data } : viewingUnit;
                  setViewingUnit(null);
                  openEditModal(target);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 18px",
                  background: "#0284c7",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "700",
                  cursor: "pointer",
                  fontSize: "0.85rem"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Unit
              </button>
              <button
                onClick={() => setViewingUnit(null)}
                style={{ padding: "8px 20px", background: "var(--wz-primary-navy)", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer", fontSize: "0.85rem" }}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 3. Retire Confirmation & Blocker Modal ================= */}
      {retiringUnit && (
        <div className="wz-modal-overlay" onClick={() => setRetiringUnit(null)}>
          <div className="wz-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: retireBlockers ? "#991b1b" : "#0f172a" }}>
                {retireBlockers ? "Cannot Retire Unit — Active Bookings Exist" : `Retire Unit ${retiringUnit.unitId}?`}
              </h3>
              <button
                onClick={() => setRetiringUnit(null)}
                style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}
              >
                &times;
              </button>
            </div>

            {retireBlockers ? (
              <div>
                <div style={{ padding: "12px 14px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#991b1b", fontSize: "0.86rem", marginBottom: "14px" }}>
                  <strong>Warning:</strong> Unit <strong>{retiringUnit.unitId}</strong> currently has <strong>{retireBlockers.length} active/ongoing booking(s)</strong>.
                  Co-op policy requires all active assignments to be resolved or reassigned before retiring this unit.
                </div>

                <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px" }}>
                  {retireBlockers.map((b) => (
                    <div key={b._id || b.displayId} style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9", fontSize: "0.82rem" }}>
                      <strong>{b.displayId || "APP"}</strong> — {b.memberName} ({b.startDate} to {b.endDate})
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                  <button
                    onClick={() => setRetiringUnit(null)}
                    style={{ padding: "8px 18px", background: "var(--wz-primary-navy)", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                  >
                    Understood (Resolve Bookings First)
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ margin: "0 0 14px 0", fontSize: "0.88rem", color: "#475569", lineHeight: "1.5" }}>
                  Are you sure you want to retire <strong>{retiringUnit.unitId} ({retiringUnit.name})</strong>?
                  <br /><br />
                  Retiring marks the unit as decommissioned / out of service. All historical rental records and maintenance logs are safely preserved for co-op audits.
                </p>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    onClick={() => setRetiringUnit(null)}
                    style={{ padding: "8px 16px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={retiringLoading}
                    onClick={handleConfirmRetire}
                    style={{ padding: "8px 18px", background: "#e11d48", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                  >
                    {retiringLoading ? "Retiring..." : "Confirm Retirement"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= 4. Change Status Modal (Operational, Under Maintenance, Retired) ================= */}
      {statusModalUnit && (
        <div className="wz-modal-overlay" onClick={() => !statusSubmitting && setStatusModalUnit(null)}>
          <div className="wz-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                  Change Operating Status
                </h3>
                <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                  Unit: <span className="wz-unit-code-badge">{statusModalUnit.unitId}</span> &bull; <strong>{statusModalUnit.name}</strong>
                </div>
              </div>
              <button
                disabled={statusSubmitting}
                onClick={() => setStatusModalUnit(null)}
                style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}
              >
                &times;
              </button>
            </div>

            {statusError && (
              <div style={{ padding: "10px 14px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#991b1b", fontSize: "0.84rem", marginBottom: "14px", lineHeight: "1.4" }}>
                <strong>Error:</strong> {statusError}
              </div>
            )}

            {/* Current Status banner */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", marginBottom: "12px", fontSize: "0.8rem", color: "#475569" }}>
              <span>Current Operating Condition:</span>
              <strong>{statusModalUnit.operatingCondition || (statusModalUnit.status === "Available" ? "Operational" : statusModalUnit.status === "Maintenance" ? "Under Maintenance" : "Retired")}</strong>
            </div>

            {/* 3 Status Options: Operational, Under Maintenance, Retired */}
            <div className="wz-status-options-grid">
              {/* Option 1: Operational */}
              <div
                className={`wz-status-option-card ${selectedStatus === "Operational" ? "selected" : ""}`}
                onClick={() => setSelectedStatus("Operational")}
              >
                <div className="wz-status-radio-dot">
                  {selectedStatus === "Operational" && <div className="wz-status-radio-inner" />}
                </div>
                <div className="wz-status-option-info">
                  <div className="wz-status-option-title">
                    <span>Operational</span>
                    <span className="wz-cond-badge wz-cond-operational" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>Ready</span>
                  </div>
                  <div className="wz-status-option-desc">
                    Machinery is in prime operating condition and available for rental bookings.
                  </div>
                </div>
              </div>

              {/* Option 2: Under Maintenance */}
              <div
                className={`wz-status-option-card ${selectedStatus === "Under Maintenance" ? "selected" : ""}`}
                onClick={() => setSelectedStatus("Under Maintenance")}
              >
                <div className="wz-status-radio-dot">
                  {selectedStatus === "Under Maintenance" && <div className="wz-status-radio-inner" />}
                </div>
                <div className="wz-status-option-info">
                  <div className="wz-status-option-title">
                    <span>Under Maintenance</span>
                    <span className="wz-cond-badge wz-cond-maintenance" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>Workshop</span>
                  </div>
                  <div className="wz-status-option-desc">
                    Undergoing preventive inspection, servicing, or repairs. Blocked from new bookings.
                  </div>
                </div>
              </div>

              {/* Option 3: Retired */}
              <div
                className={`wz-status-option-card ${selectedStatus === "Retired" ? "selected" : ""}`}
                onClick={() => setSelectedStatus("Retired")}
              >
                <div className="wz-status-radio-dot">
                  {selectedStatus === "Retired" && <div className="wz-status-radio-inner" />}
                </div>
                <div className="wz-status-option-info">
                  <div className="wz-status-option-title">
                    <span>Retired</span>
                    <span className="wz-cond-badge wz-cond-retired" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>Archived</span>
                  </div>
                  <div className="wz-status-option-desc">
                    Decommissioned or permanently taken out of rotation. Historical bookings remain safely preserved.
                  </div>
                </div>
              </div>
            </div>

            {/* Note alert if taking unit out of service */}
            {(selectedStatus === "Under Maintenance" || selectedStatus === "Retired") && (
              <div style={{ padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "0.78rem", color: "#475569", marginBottom: "14px", lineHeight: "1.4" }}>
                <strong>System Rule:</strong> Active approved member bookings will be checked before taking this unit out of service.
              </div>
            )}

            {/* Optional Status Notes */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                Status / Workshop Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="e.g. Scheduled oil change, hydraulic inspection..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  fontSize: "0.82rem",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={() => setStatusModalUnit(null)}
                style={{ padding: "8px 16px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "600", cursor: "pointer", fontSize: "0.84rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={handleConfirmStatusChange}
                style={{
                  padding: "8px 20px",
                  background: "var(--wz-primary-navy)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "700",
                  cursor: statusSubmitting ? "not-allowed" : "pointer",
                  fontSize: "0.84rem",
                }}
              >
                {statusSubmitting ? "Updating..." : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 5. Change Driver Assignment Modal ================= */}
      {driverModalUnit && (
        <div className="wz-modal-overlay" onClick={() => !driverSubmitting && setDriverModalUnit(null)}>
          <div className="wz-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "1.25rem", fontWeight: "800", color: "#0f172a" }}>
                  Assign Driver to Machinery
                </h3>
                <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                  Unit: <span className="wz-unit-code-badge">{driverModalUnit.unitId}</span> &bull; <strong>{driverModalUnit.name}</strong>
                </div>
              </div>
              <button
                disabled={driverSubmitting}
                onClick={() => setDriverModalUnit(null)}
                style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}
              >
                &times;
              </button>
            </div>

            {driverError && (
              <div style={{ padding: "10px 14px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#991b1b", fontSize: "0.84rem", marginBottom: "14px", lineHeight: "1.4" }}>
                <strong>Error:</strong> {driverError}
              </div>
            )}

            {/* Current Assignment Callout */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "14px", fontSize: "0.84rem", color: "#475569" }}>
              <div>
                <span style={{ color: "#64748b", fontSize: "0.78rem", display: "block" }}>Currently Assigned Driver:</span>
                <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                  {driverModalUnit.assignedDriver && driverModalUnit.assignedDriver !== "Unassigned"
                    ? driverModalUnit.assignedDriver
                    : "No Driver Assigned (Unassigned)"}
                </strong>
                {driverModalUnit.driverPhone && (
                  <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px" }}>
                    &bull; {driverModalUnit.driverPhone}
                  </span>
                )}
              </div>
              {driverModalUnit.assignedDriver && driverModalUnit.assignedDriver !== "Unassigned" && (
                <button
                  type="button"
                  disabled={driverSubmitting}
                  onClick={() => handleAssignDriver("Unassigned", "")}
                  style={{
                    padding: "5px 10px",
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    color: "#e11d48",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                  title="Remove current driver assignment"
                >
                  Unassign
                </button>
              )}
            </div>

            {/* Search registered drivers */}
            <div style={{ marginBottom: "12px" }}>
              <input
                type="text"
                placeholder="Search registered drivers by name, phone..."
                value={driverSearchQuery}
                onChange={(e) => setDriverSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  outline: "none"
                }}
              />
            </div>

            {/* Registered Drivers List from Drivers DB */}
            <div style={{ maxHeight: "280px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "6px" }}>
              {/* Option to Unassign */}
              <div
                onClick={() => !driverSubmitting && handleAssignDriver("Unassigned", "")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  cursor: driverSubmitting ? "not-allowed" : "pointer",
                  marginBottom: "4px",
                  background: (!driverModalUnit.assignedDriver || driverModalUnit.assignedDriver === "Unassigned") ? "#f1f5f9" : "transparent",
                  border: "1px solid",
                  borderColor: (!driverModalUnit.assignedDriver || driverModalUnit.assignedDriver === "Unassigned") ? "#cbd5e1" : "transparent",
                  transition: "background 0.15s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#e2e8f0",
                    color: "#64748b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "700",
                    fontSize: "0.85rem"
                  }}>
                    —
                  </div>
                  <div>
                    <div style={{ fontWeight: "700", color: "#334155", fontSize: "0.88rem" }}>Unassigned</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Self-operated or no designated driver</div>
                  </div>
                </div>
                {(!driverModalUnit.assignedDriver || driverModalUnit.assignedDriver === "Unassigned") && (
                  <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "#0284c7", background: "#e0f2fe", padding: "3px 8px", borderRadius: "12px" }}>
                    Current
                  </span>
                )}
              </div>

              {/* Filtered Drivers from Drivers database */}
              {drivers
                .filter((d) => {
                  const q = driverSearchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (d.name && d.name.toLowerCase().includes(q)) ||
                    (d.phone && d.phone.includes(q)) ||
                    (d.status && d.status.toLowerCase().includes(q))
                  );
                })
                .map((driver) => {
                  const isCurrent = driverModalUnit.assignedDriver === driver.name;
                  return (
                    <div
                      key={driver._id || driver.id || driver.name}
                      onClick={() => !driverSubmitting && handleAssignDriver(driver.name, driver.phone || "")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        cursor: driverSubmitting ? "not-allowed" : "pointer",
                        marginBottom: "4px",
                        background: isCurrent ? "#f1f5f9" : "#ffffff",
                        border: "1px solid",
                        borderColor: isCurrent ? "#cbd5e1" : "#f1f5f9",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = "#f8fafc";
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = "#ffffff";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {driver.avatar ? (
                          <img
                            src={driver.avatar}
                            alt={driver.name}
                            style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            background: "#0f172a",
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "700",
                            fontSize: "0.85rem"
                          }}>
                            {driver.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontWeight: "700", color: "#0f172a", fontSize: "0.88rem" }}>{driver.name}</span>
                            <span style={{
                              fontSize: "0.7rem",
                              fontWeight: "600",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              background: driver.status === "On Duty" ? "#f1f5f9" : driver.status === "Sick Leave" ? "#fee2e2" : "#fef9c3",
                              color: driver.status === "On Duty" ? "#0f172a" : driver.status === "Sick Leave" ? "#991b1b" : "#854d0e"
                            }}>
                              {driver.status || "Active"}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            {driver.phone || "No phone"} {driver.email ? `• ${driver.email}` : ""}
                          </div>
                        </div>
                      </div>

                      <div>
                        {isCurrent ? (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "0.75rem",
                            fontWeight: "700",
                            color: "#0f172a",
                            background: "#e2e8f0",
                            padding: "4px 9px",
                            borderRadius: "12px"
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Current
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={driverSubmitting}
                            style={{
                              padding: "5px 12px",
                              background: "#0f172a",
                              border: "1px solid #0f172a",
                              color: "#ffffff",
                              borderRadius: "6px",
                              fontSize: "0.78rem",
                              fontWeight: "700",
                              cursor: "pointer"
                            }}
                          >
                            Assign
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {drivers.length === 0 && (
                <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
                  {driversLoading ? "Loading drivers from registry..." : "No drivers registered yet."}
                </div>
              )}
            </div>

            {/* Footer with link to Drivers registry */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
              <Link
                to="/manager/drivers"
                style={{ fontSize: "0.8rem", color: "#0284c7", fontWeight: "600", textDecoration: "none" }}
              >
                Manage registered drivers &rarr;
              </Link>
              <button
                type="button"
                disabled={driverSubmitting}
                onClick={() => setDriverModalUnit(null)}
                style={{
                  padding: "8px 16px",
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "0.84rem"
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
