export function getApplicationProgress(application) {
  const status = (application?.status || "Pending").toLowerCase();
  const start = application?.startDate ? new Date(application.startDate.includes("T") ? application.startDate : `${application.startDate}T00:00:00`) : null;
  const end = application?.endDate ? new Date(application.endDate.includes("T") ? application.endDate : `${application.endDate}T23:59:59`) : null;
  const now = new Date();

  if (status === "pending") return { label: "Pending Approval", tone: "pending" };
  if (status === "rejected") return { label: "Rejected", tone: "rejected" };
  if (status === "cancelled") return { label: "Cancelled", tone: "muted" };
  if (status === "returned" || (end && end < now)) return { label: "Completed", tone: "complete" };
  if (status === "checked-out") return { label: "In-use", tone: "active" };
  if (status === "approved" && start && start > now) return { label: "Scheduled", tone: "scheduled" };
  if (status === "approved") return { label: "In-use", tone: "active" };
  return { label: application?.status || "Pending", tone: "muted" };
}

export function formatRentalPeriod(application) {
  const start = application?.startDate;
  const end = application?.endDate;
  if (!start && !end) return "Dates to be confirmed";
  const format = (value) => {
    const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  return `${format(start)}${end && end !== start ? ` – ${format(end)}` : ""}`;
}

export function getApplicationsUrl(email) {
  return `/applications?memberEmail=${encodeURIComponent(email || "")}`;
}

export function unwrapListResponse(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  return [];
}
