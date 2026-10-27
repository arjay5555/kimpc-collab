// Manager approval queue data.
const bookings = [
  { id: "BK-1042", member: "Maya Patel", cooperative: "Green Valley Co-op", equipment: "John Deere 5075E", dates: "Sep 24 - Sep 26", submitted: "Today, 08:42", status: "Pending" },
  { id: "BK-1041", member: "Luis Hernandez", cooperative: "Green Valley Co-op", equipment: "Kuhn Disc Mower", dates: "Sep 27 - Sep 29", submitted: "Yesterday", status: "Pending" },
  { id: "BK-1038", member: "Nora Chen", cooperative: "Green Valley Co-op", equipment: "New Holland Baler", dates: "Oct 02 - Oct 04", submitted: "Sep 20", status: "Pending" },
  { id: "BK-1037", member: "Eli Brooks", cooperative: "Green Valley Co-op", equipment: "Case IH Tractor", dates: "Oct 05 - Oct 07", submitted: "Sep 19", status: "Pending" }
];

// Shared issue data used by manager and administrator views.
const issueLogs = [
  { type: "Equipment breakdown", location: "North field", detail: "John Deere 5075E", status: "High priority", statusClass: "status-warning", owner: "Assigned to R. Cole" },
  { type: "Late return", location: "South shed", detail: "Kuhn Disc Mower", status: "In progress", statusClass: "status-pending", owner: "Assigned to M. Lee" },
  { type: "Scheduling conflict", location: "East field", detail: "New Holland Baler", status: "Review needed", statusClass: "status-pending", owner: "Unassigned" }
];

// Member dashboard rental data grouped by status tab.
const rentalData = {
  active: [
    { equipment: "John Deere 5075E", kind: "Tractor", operator: "Marcus Lee", dates: "Sep 20 - Sep 23", location: "North field", status: "Active", statusClass: "status-active", icon: "JD" },
    { equipment: "Kuhn Disc Mower", kind: "Mower", operator: "Riley Cole", dates: "Sep 21 - Sep 22", location: "South field", status: "Active", statusClass: "status-active", icon: "KM" }
  ],
  upcoming: [
    { equipment: "New Holland Baler", kind: "Baler", dates: "Sep 27 - Sep 29", location: "East field", status: "Upcoming", statusClass: "status-upcoming", icon: "NH" },
    { equipment: "Case IH Tractor", kind: "Tractor", dates: "Oct 02 - Oct 04", location: "North field", status: "Upcoming", statusClass: "status-upcoming", icon: "CI" },
    { equipment: "JCB Loader", kind: "Loader", dates: "Oct 07 - Oct 08", location: "Central yard", status: "Pending", statusClass: "status-pending", icon: "JCB" }
  ],
  past: [
    { equipment: "Massey Ferguson 4707", kind: "Tractor", dates: "Sep 12 - Sep 14", location: "West field", status: "Completed", statusClass: "status-completed", icon: "MF" },
    { equipment: "Hesston Windrower", kind: "Windrower", dates: "Sep 05 - Sep 07", location: "South field", status: "Completed", statusClass: "status-completed", icon: "HW" }
  ]
};

const availableEquipment = [
  { name: "Precision Seeder", kind: "Seeding", icon: "PS" },
  { name: "Round Baler", kind: "Baling", icon: "RB" },
  { name: "Irrigation System", kind: "Irrigation", icon: "IS" },
  { name: "Combine Harvester", kind: "Harvesting", icon: "CH" },
  { name: "Field Tractor", kind: "Tractor", icon: "FT" },
  { name: "Co-op Attachments", kind: "Implements", icon: "CA" }
];


// ---------------------------------------------------------------------------
// Server API helpers. All accounts and equipment applications now live in MongoDB
// (through the Express server) instead of this browser's localStorage.
// ---------------------------------------------------------------------------

// Small fetch wrapper that always resolves to { ok, status, data }.
async function api(path, { method = "GET", body } = {}) {
  try {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    const token = localStorage.getItem("token") || sessionStorage.getItem("minders-jwt-token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const adminEmail = getSignedInEmail();
    if (adminEmail) headers["x-admin-email"] = adminEmail;

    const response = await fetch(`/api${path}`, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Cannot reach the server. Is it running? (npm start)" } };
  }
}

// Data now comes from users, so escape it before putting it into innerHTML templates.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// Shared form feedback helper.
function setFeedback(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function getSignedInEmail() {
  return (sessionStorage.getItem("minders-member-email") || "").trim().toLowerCase();
}

function accountPath(email) {
  return `/accounts/${encodeURIComponent(email)}`;
}

function getInitials(fullName) {
  return fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatApplicationDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatApplicationDates(startDate, endDate) {
  return `${formatApplicationDate(startDate)} - ${formatApplicationDate(endDate)}`;
}

function getDashboardForRole(role) {
  if (role === "admin") return "admin.html";
  if (role === "manager") return "manager.html";
  return "member.html";
}

// Reusable dialog handlers for editing details and cancelling pending bookings
function setupBookingManagement(onReload) {
  const editDialog = document.querySelector("#edit-booking-dialog");
  const editForm = document.querySelector("#edit-booking-form");
  const editFeedback = document.querySelector("#edit-booking-feedback");
  const cancelDialog = document.querySelector("#cancel-booking-dialog");
  const cancelDesc = document.querySelector("#cancel-booking-desc");
  const cancelFeedback = document.querySelector("#cancel-booking-feedback");
  const cancelIdInput = document.querySelector("#cancel-booking-id");

  document.querySelector("#close-edit-booking")?.addEventListener("click", () => editDialog?.close());
  document.querySelector("#abort-edit-booking")?.addEventListener("click", () => editDialog?.close());
  editDialog?.addEventListener("click", (e) => { if (e.target === editDialog) editDialog.close(); });

  document.querySelector("#close-cancel-booking")?.addEventListener("click", () => cancelDialog?.close());
  document.querySelector("#abort-cancel-booking")?.addEventListener("click", () => cancelDialog?.close());
  cancelDialog?.addEventListener("click", (e) => { if (e.target === cancelDialog) cancelDialog.close(); });

  if (editForm && !editForm._bound) {
    editForm._bound = true;
    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const appId = document.querySelector("#edit-booking-id").value;
      const equipment = document.querySelector("#edit-booking-equipment").value;
      const startDate = document.querySelector("#edit-booking-start").value;
      const endDate = document.querySelector("#edit-booking-end").value;

      if (!equipment || !startDate || !endDate) {
        setFeedback(editFeedback, "Please select equipment and both dates.", true);
        return;
      }
      if (endDate < startDate) {
        setFeedback(editFeedback, "End date must be on or after start date.", true);
        return;
      }

      setFeedback(editFeedback, "Saving changes...");
      const saveBtn = document.querySelector("#save-edit-booking");
      if (saveBtn) saveBtn.disabled = true;

      const { ok, data } = await api(`/applications/${encodeURIComponent(appId)}`, {
        method: "PATCH",
        body: {
          equipment,
          startDate,
          endDate,
          actorEmail: getSignedInEmail(),
          actorRole: "member"
        }
      });

      if (saveBtn) saveBtn.disabled = false;

      if (!ok) {
        setFeedback(editFeedback, data.error || "Could not update booking details.", true);
        return;
      }

      editDialog.close();
      if (typeof onReload === "function") onReload();
    });
  }

  const confirmCancelBtn = document.querySelector("#confirm-cancel-booking");
  if (confirmCancelBtn && !confirmCancelBtn._bound) {
    confirmCancelBtn._bound = true;
    confirmCancelBtn.addEventListener("click", async () => {
      const appId = cancelIdInput?.value;
      if (!appId) return;

      confirmCancelBtn.disabled = true;
      confirmCancelBtn.textContent = "Cancelling...";
      setFeedback(cancelFeedback, "Cancelling request...");

      const { ok, data } = await api(`/applications/${encodeURIComponent(appId)}`, {
        method: "PATCH",
        body: {
          status: "Cancelled",
          actorEmail: getSignedInEmail(),
          actorRole: "member"
        }
      });

      confirmCancelBtn.disabled = false;
      confirmCancelBtn.textContent = "Yes, cancel request";

      if (!ok) {
        setFeedback(cancelFeedback, data.error || "Could not cancel request.", true);
        return;
      }

      cancelDialog.close();
      if (typeof onReload === "function") onReload();
    });
  }
}

function bindBookingActionButtons(container, onReload) {
  setupBookingManagement(onReload);

  const editDialog = document.querySelector("#edit-booking-dialog");
  const editFeedback = document.querySelector("#edit-booking-feedback");
  const cancelDialog = document.querySelector("#cancel-booking-dialog");
  const cancelDesc = document.querySelector("#cancel-booking-desc");
  const cancelFeedback = document.querySelector("#cancel-booking-feedback");
  const cancelIdInput = document.querySelector("#cancel-booking-id");

  container.querySelectorAll(".btn-edit-booking").forEach((btn) => {
    btn.addEventListener("click", () => {
      const appId = btn.dataset.appId;
      const equip = btn.dataset.equip;
      const start = btn.dataset.start;
      const end = btn.dataset.end;

      const idEl = document.querySelector("#edit-booking-id");
      const equipEl = document.querySelector("#edit-booking-equipment");
      const startEl = document.querySelector("#edit-booking-start");
      const endEl = document.querySelector("#edit-booking-end");

      if (idEl) idEl.value = appId || "";
      if (equipEl) equipEl.value = equip || "";
      if (startEl) startEl.value = start || "";
      if (endEl) endEl.value = end || "";
      setFeedback(editFeedback, "");
      editDialog?.showModal();
    });
  });

  container.querySelectorAll(".btn-cancel-booking").forEach((btn) => {
    btn.addEventListener("click", () => {
      const appId = btn.dataset.appId;
      const equip = btn.dataset.equip || "equipment";
      const dates = btn.dataset.dates || "";

      if (cancelIdInput) cancelIdInput.value = appId || "";
      if (cancelDesc) cancelDesc.textContent = `Are you sure you want to cancel your pending booking request for ${equip} (${dates}) prior to manager approval?`;
      setFeedback(cancelFeedback, "");
      cancelDialog?.showModal();
    });
  });
}

// Load one member's applications from the database and draw them.
async function renderMemberApplications(listElement, memberEmail) {
  const { ok, data } = await api(`/applications?memberEmail=${encodeURIComponent(memberEmail)}`);
  if (!ok) {
    listElement.innerHTML = `<p class="member-applications-empty">${escapeHtml(data.error || "Could not load applications.")}</p>`;
    return;
  }
  if (!data.length) {
    listElement.innerHTML = '<p class="member-applications-empty">No applications submitted yet.</p>';
    return;
  }
  listElement.innerHTML = data.map((application) => {
    const isPending = application.status === "Pending";
    const isCancelled = application.status === "Cancelled";
    let statusLabel = application.status;
    let statusClass = "status-pending";

    if (isPending) {
      statusLabel = "Pending Approval";
      statusClass = "status-pending";
    } else if (application.status === "Approved") {
      statusClass = "status-approved";
    } else if (application.status === "Rejected") {
      statusClass = "status-rejected";
    } else if (isCancelled) {
      statusLabel = "Cancelled";
      statusClass = "status-cancelled";
    }

    const actionButtons = isPending ? `
      <div class="booking-actions-group">
        <button class="btn-action-small btn-edit-booking" type="button" data-app-id="${escapeHtml(application.id)}" data-equip="${escapeHtml(application.equipment)}" data-start="${escapeHtml(application.startDate)}" data-end="${escapeHtml(application.endDate)}">
          ✏️ Edit Details
        </button>
        <button class="btn-action-small btn-action-danger btn-cancel-booking" type="button" data-app-id="${escapeHtml(application.id)}" data-equip="${escapeHtml(application.equipment)}" data-dates="${formatApplicationDates(application.startDate, application.endDate)}">
          ✕ Cancel
        </button>
      </div>
    ` : `<div class="booking-actions-group"><span style="color:var(--ink-soft); font-size:.7rem;">${isCancelled ? "Request withdrawn" : "—"}</span></div>`;

    return `<article class="member-application-row">
      <div class="member-application-equipment"><strong>${escapeHtml(application.equipment)}</strong><small>Requested ${formatApplicationDates(application.startDate, application.endDate)}</small></div>
      <small class="member-application-submitted">Submitted ${new Date(application.submittedAt).toLocaleDateString()}</small>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      ${actionButtons}
    </article>`;
  }).join("");

  bindBookingActionButtons(listElement, () => renderMemberApplications(listElement, memberEmail));
}

// Member dashboard: authentication guard, profile, rental tabs, and equipment applications.
function initMemberPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true") {
    window.location.replace("login.html");
    return;
  }
  const profileTrigger = document.querySelector("#open-profile");
  const profileDialog = document.querySelector("#profile-dialog");
  const profileForm = document.querySelector("#profile-form");
  const profileVerification = document.querySelector("#profile-verification");
  const profileFeedback = document.querySelector("#profile-feedback");
  const verificationEmail = document.querySelector("#profile-verification-email");
  const profileFields = ["fullName", "email", "phone", "address", "address2", "city", "region", "postalCode", "country"];
  const updateProfileIdentity = (fullName) => {
    document.querySelector("#header-member-name").textContent = fullName;
    document.querySelector("#profile-avatar").textContent = getInitials(fullName);
  };
  // Fill the profile form from the account stored in MongoDB.
  const populateProfileForm = async () => {
    const ownerEmail = getSignedInEmail();
    const { ok, data } = await api(accountPath(ownerEmail));
    const saved = ok ? data : {};
    const values = {
      fullName: saved.fullName || "Jordan Davis",
      email: saved.email || ownerEmail,
      phone: saved.phone || "",
      address: saved.address || "",
      address2: saved.address2 || "",
      city: saved.city || "",
      region: saved.region || "",
      postalCode: saved.postalCode || "",
      country: saved.country || ""
    };
    profileFields.forEach((field) => { profileForm.elements.namedItem(field).value = values[field]; });
    updateProfileIdentity(values.fullName);
    const pendingUpdate = saved.pendingUpdate;
    profileForm.hidden = Boolean(pendingUpdate);
    profileVerification.hidden = !pendingUpdate;
    if (pendingUpdate) verificationEmail.textContent = pendingUpdate.email;
  };
  populateProfileForm();
  profileTrigger?.addEventListener("click", async () => {
    await populateProfileForm();
    profileDialog.showModal();
  });
  document.querySelector("#close-profile")?.addEventListener("click", () => profileDialog.close());
  profileDialog?.addEventListener("click", (event) => {
    if (event.target === profileDialog) profileDialog.close();
  });
  document.querySelector("#logout-button")?.addEventListener("click", () => {
    sessionStorage.removeItem("minders-member-auth");
    sessionStorage.removeItem("minders-member-email");
    sessionStorage.removeItem("minders-account-role");
    window.location.href = "login.html";
  });
  // Step 1: save the edits as "pending" in the database.
  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!profileForm.checkValidity()) { profileForm.reportValidity(); return; }
    const formData = new FormData(profileForm);
    const body = Object.fromEntries(profileFields.map((field) => [field, String(formData.get(field) || "").trim()]));
    const { ok, data } = await api(`${accountPath(getSignedInEmail())}/profile-update`, { method: "POST", body });
    if (!ok) {
      setFeedback(profileFeedback, data.error || "Could not save your changes.", true);
      return;
    }
    profileForm.hidden = true;
    profileVerification.hidden = false;
    verificationEmail.textContent = data.pendingUpdate.email;
    setFeedback(profileFeedback, "Profile changes are pending email verification.");
  });
  // Step 2: confirm, which applies the pending edits in the database.
  document.querySelector("#confirm-profile-update")?.addEventListener("click", async () => {
    const { ok, data } = await api(`${accountPath(getSignedInEmail())}/profile-confirm`, { method: "POST" });
    if (!ok) {
      setFeedback(profileFeedback, data.error || "Could not confirm the update.", true);
      return;
    }
    sessionStorage.setItem("minders-member-email", data.email);
    updateProfileIdentity(data.fullName);
    profileDialog.close();
  });

  const list = document.querySelector("#rental-list");
  const pendingBadge = document.querySelector("#pending-tab-badge");
  let currentActiveTab = "active";

  const refreshPendingCount = async () => {
    const memberEmail = getSignedInEmail();
    const { ok, data } = await api(`/applications?memberEmail=${encodeURIComponent(memberEmail)}`);
    const pendingApps = ok && Array.isArray(data) ? data.filter((a) => a.status === "Pending") : [];
    if (pendingBadge) pendingBadge.textContent = pendingApps.length;
    return pendingApps;
  };

  const renderRentals = async (tabName) => {
    currentActiveTab = tabName;
    if (tabName === "pending") {
      const pendingApps = await refreshPendingCount();
      if (!pendingApps.length) {
        list.innerHTML = `<div style="padding: 36px 20px; text-align: center; color: var(--ink-soft); background: var(--surface); border: 1px solid var(--line); border-radius: 8px;">
          <p style="margin: 0; font-size: .88rem; font-weight: 500;">You currently have no pending booking requests awaiting manager approval.</p>
          <p style="margin: 6px 0 0; font-size: .75rem;">Need equipment for your field? Submit a new booking anytime.</p>
          <button class="button button-primary" style="margin-top: 14px;" type="button" id="book-from-empty">Book equipment now &rarr;</button>
        </div>`;
        document.querySelector("#book-from-empty")?.addEventListener("click", () => {
          document.querySelector("#open-application")?.click();
        });
        return;
      }

      list.innerHTML = pendingApps.map((app) => `
        <article class="rental-card pending-booking-card" style="border-left: 4px solid #d6a52d;">
          <div class="rental-equipment">
            <span class="equipment-icon">${getInitials(app.equipment)}</span>
            <div>
              <strong>${escapeHtml(app.equipment)}</strong>
              <small>ID: ${escapeHtml(app.displayId || `APP-${String(app.id).slice(-6).toUpperCase()}`)}</small>
              <small style="color:var(--ink-soft);">Submitted ${new Date(app.submittedAt).toLocaleDateString()}</small>
            </div>
          </div>
          <div class="date-detail">
            <small>Requested rental dates</small>
            <strong>${formatApplicationDates(app.startDate, app.endDate)}</strong>
            <small style="color:var(--ink-soft);">${app.startDate} to ${app.endDate}</small>
          </div>
          <div class="date-detail">
            <small>Approval status</small>
            <div><span class="status-badge status-pending">Pending Approval</span></div>
            <small style="color:#98701c; font-size:.68rem;">Awaiting manager review</small>
          </div>
          <div class="booking-actions-group" style="justify-content: flex-end;">
            <button class="btn-action-small btn-edit-booking" type="button" data-app-id="${escapeHtml(app.id)}" data-equip="${escapeHtml(app.equipment)}" data-start="${escapeHtml(app.startDate)}" data-end="${escapeHtml(app.endDate)}">
              ✏️ Edit Details
            </button>
            <button class="btn-action-small btn-action-danger btn-cancel-booking" type="button" data-app-id="${escapeHtml(app.id)}" data-equip="${escapeHtml(app.equipment)}" data-dates="${formatApplicationDates(app.startDate, app.endDate)}">
              ✕ Cancel
            </button>
          </div>
        </article>
      `).join("");

      bindBookingActionButtons(list, async () => {
        await refreshPendingCount();
        renderRentals("pending");
      });
      return;
    }

    refreshPendingCount();

    // Fetch real member applications from MongoDB
    const memberEmail = getSignedInEmail();
    let realRentalsForTab = [];
    if (memberEmail) {
      const { ok: okMyApps, data: myApps } = await api(`/applications?memberEmail=${encodeURIComponent(memberEmail)}`);
      if (okMyApps && Array.isArray(myApps)) {
        if (tabName === "active") {
          realRentalsForTab = myApps.filter((a) => a.status === "Approved" || a.status === "Checked-Out");
        } else if (tabName === "upcoming") {
          realRentalsForTab = myApps.filter((a) => a.status === "Approved");
        } else if (tabName === "past") {
          realRentalsForTab = myApps.filter((a) => a.status === "Returned" || a.status === "Completed" || a.status === "Rejected" || a.status === "Cancelled");
        }
      }
    }

    const realCards = realRentalsForTab.map((app) => {
      const isApproved = app.status === "Approved";
      const isCheckedOut = app.status === "Checked-Out";
      let statusClass = isApproved ? "status-approved" : (isCheckedOut ? "status-active" : "status-completed");
      return `
        <article class="rental-card" style="border-left: 4px solid var(--teal, #0d9488);">
          <div class="rental-equipment">
            <span class="equipment-icon">${getInitials(app.equipment)}</span>
            <div>
              <strong>${escapeHtml(app.equipment)}</strong>
              <small>ID: ${escapeHtml(app.displayId || `APP-${String(app.id || app._id).slice(-6).toUpperCase()}`)}</small>
            </div>
          </div>
          <div class="date-detail">
            <small>Rental dates</small>
            <strong>${formatApplicationDates(app.startDate, app.endDate)}</strong>
            <small style="color:var(--ink-soft);">${app.startDate} to ${app.endDate}</small>
          </div>
          <div class="date-detail">
            <small>Status</small>
            <span class="status-badge ${statusClass}">${app.status}</span>
          </div>
        </article>
      `;
    });

    const mockCards = (rentalData[tabName] || []).map((rental) => `
      <article class="rental-card">
        <div class="rental-equipment"><span class="equipment-icon">${rental.icon}</span><div><strong>${rental.equipment}</strong><small>${rental.kind}</small>${rental.operator ? `<small>Operator: ${rental.operator}</small>` : ""}</div></div>
        <div class="date-detail"><small>Rental dates</small><strong>${rental.dates}</strong></div>
        <div class="date-detail"><small>Service location</small><strong>${rental.location}</strong></div>
        <span class="status-badge ${rental.statusClass}">${rental.status}</span>
      </article>`);

    const combinedCards = [...realCards, ...mockCards];
    list.innerHTML = combinedCards.length ? combinedCards.join("") : `<p class="muted" style="text-align:center; padding: 24px;">No rentals found in this section.</p>`;
  };

  // Initial load
  refreshPendingCount();
  renderRentals("active");

  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((item) => { item.classList.remove("active"); item.setAttribute("aria-selected", "false"); });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      renderRentals(tab.dataset.tab);
    });
  });

  const applicationDialog = document.querySelector("#application-dialog");
  const applicationForm = document.querySelector("#application-form");
  const applicationFeedback = document.querySelector("#application-feedback");
  const applicationEquipment = document.querySelector("#application-equipment");
  const availablePanel = document.querySelector("#available-equipment");
  const availableGrid = document.querySelector("#available-equipment-grid");
  const availableToggle = document.querySelector("#toggle-available-equipment");
  availableGrid.innerHTML = availableEquipment.map((equipment) => `
    <button class="available-equipment-card" type="button" data-apply-equipment="${equipment.name}">
      <span class="equipment-icon" aria-hidden="true">${equipment.icon}</span>
      <span class="available-equipment-details"><strong>${equipment.name}</strong><small>${equipment.kind}</small></span>
      <span class="available-equipment-status status-available"><span class="availability-dot" aria-hidden="true"></span><span>Available</span><span aria-hidden="true">&#8594;</span></span>
    </button>`).join("");
  availableToggle?.addEventListener("click", () => {
    availablePanel.hidden = !availablePanel.hidden;
    availableToggle.setAttribute("aria-expanded", String(!availablePanel.hidden));
  });
  availableGrid.querySelectorAll("[data-apply-equipment]").forEach((item) => {
    item.addEventListener("click", () => {
      applicationEquipment.value = item.dataset.applyEquipment;
      setFeedback(applicationFeedback, "");
      applicationDialog.showModal();
    });
  });
  document.querySelector("#open-application")?.addEventListener("click", () => applicationDialog.showModal());
  document.querySelector("#close-application")?.addEventListener("click", () => applicationDialog.close());
  applicationDialog?.addEventListener("click", (event) => {
    if (event.target === applicationDialog) applicationDialog.close();
  });
  // Save the rental request in MongoDB so the manager can see it from any device.
  applicationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(applicationForm);
    const startDate = formData.get("startDate");
    const endDate = formData.get("endDate");
    if (endDate < startDate) {
      setFeedback(applicationFeedback, "End date must be on or after the start date.", true);
      return;
    }
    const { ok, data } = await api("/applications", {
      method: "POST",
      body: { memberEmail: getSignedInEmail(), equipment: formData.get("equipment"), startDate, endDate }
    });
    if (!ok) {
      setFeedback(applicationFeedback, data.error || "Could not submit your request.", true);
      return;
    }
    setFeedback(applicationFeedback, "Request submitted and waiting for manager approval.");
    applicationForm.reset();
    await refreshPendingCount();
    if (currentActiveTab === "pending") {
      renderRentals("pending");
    }
  });
}

async function initApplicationsPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true") {
    window.location.replace("login.html");
    return;
  }
  const memberEmail = getSignedInEmail();
  const listElement = document.querySelector("#member-application-list");
  const { ok, data } = await api(accountPath(memberEmail));
  const fullName = (ok && data.fullName) || "Jordan Davis";
  document.querySelector("#header-member-name").textContent = fullName;
  document.querySelector("#profile-avatar").textContent = getInitials(fullName);
  renderMemberApplications(listElement, memberEmail);
  // Pick up manager decisions without a manual refresh.
  window.setInterval(() => renderMemberApplications(listElement, memberEmail), 15000);
}

// Universal login page: automatically routes members, managers, and admins to their dashboard.
function initLoginPage() {
  if (sessionStorage.getItem("minders-member-auth") === "true") {
    const currentRole = sessionStorage.getItem("minders-account-role") || "member";
    window.location.replace(getDashboardForRole(currentRole));
    return;
  }

  function completeSignIn(data) {
    const role = data.role || "member";
    if (data.token) {
      localStorage.setItem("token", data.token);
      sessionStorage.setItem("minders-jwt-token", data.token);
    }
    sessionStorage.setItem("minders-member-auth", "true");
    sessionStorage.setItem("minders-member-email", data.email);
    sessionStorage.setItem("minders-account-role", role);
    sessionStorage.setItem("minders-account-name", data.fullName || "");
    window.location.href = getDashboardForRole(role);
  }

  const loginForm = document.querySelector("#member-login-form");
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }
    const identifier = document.querySelector("#member-email").value.trim();
    const password = document.querySelector("#member-password").value;
    const feedback = document.querySelector("#login-feedback");

    const recaptchaToken = (typeof grecaptcha !== "undefined" && grecaptcha.getResponse) ? grecaptcha.getResponse() : "";
    if (typeof grecaptcha !== "undefined" && !recaptchaToken) {
      setFeedback(feedback, "Please check the 'I'm not a robot' reCAPTCHA box.", true);
      return;
    }

    const { ok, data } = await api("/login", { method: "POST", body: { identifier, password, recaptchaToken } });
    if (!ok) {
      setFeedback(feedback, data.error || "Could not sign in.", true);
      if (typeof grecaptcha !== "undefined" && grecaptcha.reset) {
        grecaptcha.reset();
      }
      return;
    }

    if (data.mustChangePassword) {
      handleTempPasswordRequirement(data, password);
      return;
    }

    completeSignIn(data);
  });

  function handleTempPasswordRequirement(userData, tempPasswordUsed) {
    const tempDialog = document.querySelector("#temp-password-dialog");
    const tempForm = document.querySelector("#temp-password-form");
    const tempFeedback = document.querySelector("#temp-password-feedback");
    const newPwdInput = document.querySelector("#temp-new-password");
    const confirmPwdInput = document.querySelector("#temp-confirm-password");

    if (!tempDialog || !tempForm) {
      completeSignIn(userData);
      return;
    }

    if (tempFeedback) setFeedback(tempFeedback, "");
    if (newPwdInput) newPwdInput.value = "";
    if (confirmPwdInput) confirmPwdInput.value = "";
    tempDialog.showModal();

    tempForm.onsubmit = async (e) => {
      e.preventDefault();
      const newPassword = newPwdInput ? newPwdInput.value.trim() : "";
      const confirmPassword = confirmPwdInput ? confirmPwdInput.value.trim() : "";

      if (newPassword.length < 6) {
        if (tempFeedback) setFeedback(tempFeedback, "Permanent password must be at least 6 characters.", true);
        return;
      }
      if (newPassword !== confirmPassword) {
        if (tempFeedback) setFeedback(tempFeedback, "Passwords do not match.", true);
        return;
      }

      const submitBtn = document.querySelector("#btn-save-temp-password");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Setting Password...";
      }

      const { ok, data } = await api("/auth/change-temp-password", {
        method: "POST",
        body: {
          email: userData.email,
          tempPassword: tempPasswordUsed,
          newPassword,
          confirmPassword
        }
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Set Password & Continue →";
      }

      if (!ok) {
        if (tempFeedback) setFeedback(tempFeedback, data.error || "Could not change password.", true);
        return;
      }

      if (tempFeedback) setFeedback(tempFeedback, "Permanent password set successfully! Redirecting...");
      setTimeout(() => {
        tempDialog.close();
        completeSignIn(userData);
      }, 900);
    };
  }

  // ================= Official Google Identity Services =================
  async function handleGoogleCredentialResponse(response) {
    if (!response.credential) return;
    const feedback = document.querySelector("#login-feedback");
    if (feedback) setFeedback(feedback, "Verifying Google account with Minders...");

    const { ok, data } = await api("/auth/google", {
      method: "POST",
      body: { credential: response.credential }
    });

    if (!ok) {
      if (feedback) setFeedback(feedback, data.error || "Google sign-in failed.", true);
      return;
    }
    completeSignIn(data);
  }

  // Load configuration and initialize official Google & Facebook Services
  api("/config").then(({ ok, data }) => {
    const isGoogleEnabled = ok ? (data.googleLoginEnabled !== false) : true;
    const isFacebookEnabled = ok ? (data.facebookLoginEnabled !== false) : true;
    window._googleLoginEnabled = isGoogleEnabled;
    window._facebookLoginEnabled = isFacebookEnabled;

    const btnGoogle = document.querySelector("#btn-quick-google");
    const btnFacebook = document.querySelector("#btn-quick-facebook");
    const btnSignupGoogle = document.querySelector("#btn-signup-google");
    const btnSignupFacebook = document.querySelector("#btn-signup-facebook");
    const gsiWrapper = document.querySelector("#google-signin-wrapper");
    const divider = document.querySelector("#login-google-divider");
    const signupDivider = document.querySelector("#signup-social-divider");
    const signupSocialRow = document.querySelector("#signup-social-row");

    if (btnGoogle) btnGoogle.style.display = isGoogleEnabled ? "" : "none";
    if (btnFacebook) btnFacebook.style.display = isFacebookEnabled ? "" : "none";
    if (btnSignupGoogle) btnSignupGoogle.style.display = isGoogleEnabled ? "" : "none";
    if (btnSignupFacebook) btnSignupFacebook.style.display = isFacebookEnabled ? "" : "none";
    if (gsiWrapper) gsiWrapper.style.display = isGoogleEnabled ? "" : "none";
    if (divider) divider.style.display = (isGoogleEnabled || isFacebookEnabled) ? "" : "none";
    if (signupDivider) signupDivider.style.display = (isGoogleEnabled || isFacebookEnabled) ? "" : "none";
    if (signupSocialRow) signupSocialRow.style.display = (isGoogleEnabled || isFacebookEnabled) ? "" : "none";

    if (!isGoogleEnabled) return;

    const clientId = (ok && data.googleClientId) ? data.googleClientId.trim() : "";
    const btnContainer = document.querySelector("#google-signin-btn");

    function renderGsiButton() {
      if (typeof google === "undefined" || !google.accounts?.id) {
        setTimeout(renderGsiButton, 100);
        return;
      }

      if (clientId) {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true
        });

        if (btnContainer) {
          google.accounts.id.renderButton(btnContainer, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: btnContainer.offsetWidth || 340
          });
        }

        // Prompt Google One Tap popup if enabled
        google.accounts.id.prompt();
      } else {
        // Fallback UI when GOOGLE_CLIENT_ID is not yet configured in .env
        if (btnContainer) {
          btnContainer.innerHTML = `
            <button type="button" class="button button-google button-full" id="google-login-btn">
              <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
          `;

          document.querySelector("#google-login-btn")?.addEventListener("click", () => {
            const feedback = document.querySelector("#login-feedback");
            if (feedback) {
              setFeedback(
                feedback,
                "To connect real Google accounts: please add your GOOGLE_CLIENT_ID in the .env file.",
                true
              );
            }
          });
        }
      }
    }

    renderGsiButton();
  });
}

// Registration page: create a pending account in MongoDB, then confirm the email.
function initRegistrationPage() {
  const registrationForm = document.querySelector("#registration-form");
  const cooperativeIdInput = document.querySelector("#cooperative-id");
  const verificationPanel = document.querySelector("#verification-panel");
  const verificationEmail = document.querySelector("#verification-email");
  const confirmEmailButton = document.querySelector("#confirm-email-button");
  // The server hands out the next Cooperative ID (CM-001, CM-002, ...).
  api("/cooperative-id/next").then(({ ok, data }) => { cooperativeIdInput.value = ok ? data.cooperativeId : "Assigned on sign-up"; });

  registrationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!registrationForm.checkValidity()) { registrationForm.reportValidity(); return; }
    const formData = new FormData(registrationForm);
    const email = formData.get("email").trim().toLowerCase();
    const confirmEmail = formData.get("confirmEmail").trim().toLowerCase();
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");
    const feedback = document.querySelector("#registration-feedback");
    if (email !== confirmEmail) {
      setFeedback(feedback, "Email addresses do not match.", true);
      return;
    }
    if (password !== confirmPassword) {
      setFeedback(feedback, "Passwords do not match.", true);
      return;
    }
    const { ok, data } = await api("/register", {
      method: "POST",
      body: { fullName: formData.get("fullName").trim(), email, password }
    });
    if (!ok) {
      setFeedback(feedback, data.error || "Could not create the account.", true);
      return;
    }
    verificationEmail.textContent = data.email;
    registrationForm.hidden = true;
    verificationPanel.hidden = false;
    setFeedback(feedback, "Registration saved. Confirm your email to activate your account.");
  });

  confirmEmailButton?.addEventListener("click", async () => {
    const feedback = document.querySelector("#verification-feedback");
    const { ok, data } = await api("/verify", { method: "POST", body: { email: verificationEmail.textContent } });
    if (!ok) {
      setFeedback(feedback, data.error || "Could not verify the account.", true);
      return;
    }
    setFeedback(feedback, "Account verified. Redirecting to login...");
    window.setTimeout(() => { window.location.href = "login.html"; }, 900);
  });
}

// Convert an issue status into the shared badge markup.
function getIssueBadge(issue) { return `<span class="status-badge ${issue.statusClass}">${issue.status}</span>`; }

async function initManagerDashboardWidgets() {
  const revenueChart = document.querySelector("#manager-revenue-chart");
  const bookingsChart = document.querySelector("#manager-bookings-chart");
  const alertsList = document.querySelector("#manager-field-alerts");
  const issuesPanel = document.querySelector("#manager-issues");
  const pendingList = document.querySelector("#dashboard-pending-list");
  const categoriesList = document.querySelector("#manager-category-distribution");
  const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat();

  const setChartMessage = (element, message, isError = false) => {
    if (element) {
      element.innerHTML = `<p class="manager-empty-state${isError ? " is-error" : ""}">${escapeHtml(message)}</p>`;
    }
  };

  const [metricsResult, issuesResult, pendingResult, utilizationResult] = await Promise.all([
    api("/manager/dashboard/metrics"),
    api("/manager/field-issues"),
    api("/manager/bookings?status=Pending&page=1&limit=4"),
    api("/manager/utilization")
  ]);

  if (metricsResult.ok && metricsResult.data) {
    const metrics = metricsResult.data;
    const revenueValue = document.querySelector("#manager-kpi-revenue");
    const pendingValue = document.querySelector("#manager-kpi-bookings");
    const activeValue = document.querySelector("#manager-kpi-rented");
    const availableValue = document.querySelector("#manager-kpi-available");
    if (revenueValue) revenueValue.textContent = currency.format(metrics.revenue?.monthly || 0);
    if (pendingValue) pendingValue.textContent = number.format(metrics.pendingApprovalCount || 0);
    if (activeValue) activeValue.textContent = number.format(metrics.fleetStatus?.activeRentals || 0);
    if (availableValue) availableValue.textContent = number.format(metrics.fleetStatus?.available || 0);
    if (document.querySelector("#pending-count")) {
      document.querySelector("#pending-count").textContent = String(metrics.pendingApprovalCount || 0);
    }

    const status = metrics.fleetStatus || {};
    const active = Number(status.activeRentals) || 0;
    const available = Number(status.available) || 0;
    const service = (Number(status.maintenance) || 0) + (Number(status.repair) || 0);
    const total = active + available + service;
    const circumference = 2 * Math.PI * 54;
    let offset = 0;
    [
      ["fleet-donut-active", active],
      ["fleet-donut-available", available],
      ["fleet-donut-service", service]
    ].forEach(([id, value]) => {
      const segment = document.querySelector(`#${id}`);
      if (!segment) return;
      const length = total ? circumference * value / total : 0;
      segment.setAttribute("stroke-dasharray", `${length} ${circumference - length}`);
      segment.setAttribute("stroke-dashoffset", String(-offset));
      offset += length;
    });
    document.querySelector("#fleet-active-count")?.replaceChildren(document.createTextNode(number.format(active)));
    document.querySelector("#fleet-available-count")?.replaceChildren(document.createTextNode(number.format(available)));
    document.querySelector("#fleet-service-count")?.replaceChildren(document.createTextNode(number.format(service)));
  } else {
    const error = metricsResult.data?.error || "Dashboard metrics could not be loaded.";
    ["#manager-kpi-revenue", "#manager-kpi-bookings", "#manager-kpi-rented", "#manager-kpi-available"]
      .forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.textContent = "Unavailable";
          element.title = error;
        }
      });
  }

  if (pendingResult.ok && Array.isArray(pendingResult.data?.data)) {
    const requests = pendingResult.data.data;
    const pendingCount = document.querySelector("#dashboard-pending-count");
    if (pendingCount) pendingCount.textContent = number.format(pendingResult.data.total || requests.length);
    const bookingsValue = document.querySelector("#manager-kpi-bookings");
    if (bookingsValue && !metricsResult.ok) bookingsValue.textContent = number.format(pendingResult.data.total || requests.length);
    if (!requests.length) {
      setChartMessage(pendingList, "There are no booking requests awaiting review.");
    } else if (pendingList) {
      pendingList.innerHTML = requests.map((booking) => `
        <article class="manager-approval-item">
          <div class="manager-item-copy">
            <strong>${escapeHtml(booking.memberName || "Member")}</strong>
            <span>${escapeHtml(booking.equipment || "Equipment")} · ${escapeHtml(booking.startDate)} – ${escapeHtml(booking.endDate)}</span>
          </div>
          <a href="#approvals" data-view="approvals" class="manager-review-link" aria-label="Review booking for ${escapeHtml(booking.memberName || "member")}">Review</a>
        </article>
      `).join("");
    }
  } else {
    setChartMessage(pendingList, pendingResult.data?.error || "Pending requests could not be loaded.", true);
  }

  if (issuesResult.ok && Array.isArray(issuesResult.data?.issues)) {
    const issues = issuesResult.data.issues;
    if (!issues.length) {
      const message = "No active breakdowns, late returns, or schedule conflicts.";
      setChartMessage(alertsList, message);
      setChartMessage(issuesPanel, message);
    } else if (alertsList) {
      const markup = issues.slice(0, 5).map((issue) => {
        const title = {
          equipment_breakdown: "Equipment breakdown",
          maintenance: "Maintenance flag",
          late_return: "Late return",
          scheduling_conflict: "Scheduling conflict"
        }[issue.type] || "Field alert";
        const context = [
          issue.unitId || issue.equipment,
          issue.dueDate ? `Due ${issue.dueDate}` : "",
          issue.startDate && issue.endDate ? `${issue.startDate} – ${issue.endDate}` : "",
          issue.dateRange ? `${issue.dateRange.startDate} – ${issue.dateRange.endDate}` : "",
          issue.details
        ].filter(Boolean).join(" · ");
        return `
          <article class="manager-alert-item">
            <span class="manager-alert-marker ${issue.severity === "high" ? "is-high" : ""}" aria-hidden="true"></span>
            <div class="manager-item-copy">
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(context || issue.status || "")}</span>
            </div>
          </article>
        `;
      }).join("");
      alertsList.innerHTML = markup;
      if (issuesPanel) issuesPanel.innerHTML = markup;
    } else if (issuesPanel) {
      issuesPanel.innerHTML = '<p class="manager-empty-state">No active field alerts.</p>';
    }
  } else {
    const message = issuesResult.data?.error || "Field alerts could not be loaded.";
    setChartMessage(alertsList, message, true);
    setChartMessage(issuesPanel, message, true);
  }

  if (utilizationResult.ok && Array.isArray(utilizationResult.data)) {
    const categoryCounts = new Map();
    const categoryNames = [
      ["Tractors", /tractor/i],
      ["Harvesters", /harvester/i],
      ["Seeders", /seeder|planter/i],
      ["Tillers", /tiller/i],
      ["Irrigation Pumps", /irrigation|pump/i]
    ];
    for (const category of utilizationResult.data) {
      const sourceName = category.name || category.category || "Other";
      const mappedName = categoryNames.find(([, pattern]) => pattern.test(sourceName))?.[0] || sourceName;
      const existing = categoryCounts.get(mappedName) || { count: 0, runtimeHours: 0 };
      existing.count += Number(category.totalUnits) || 0;
      existing.runtimeHours += Number(category.runtimeHours) || 0;
      categoryCounts.set(mappedName, existing);
    }
    const totalUnits = [...categoryCounts.values()].reduce((sum, category) => sum + category.count, 0);
    const standardCategories = ["Tractors", "Harvesters", "Seeders", "Tillers", "Irrigation Pumps"];
    const extraCategories = [...categoryCounts.keys()].filter((name) => !standardCategories.includes(name));
    const orderedCategories = [...standardCategories, ...extraCategories];
    if (categoriesList) {
      categoriesList.innerHTML = orderedCategories.map((name) => {
        const category = categoryCounts.get(name) || { count: 0, runtimeHours: 0 };
        const percent = totalUnits ? Math.round(category.count * 100 / totalUnits) : 0;
        const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2);
        return `
          <div class="manager-category-item">
            <span class="manager-category-icon" aria-hidden="true">${escapeHtml(initials)}</span>
            <div class="manager-category-content">
              <div class="manager-category-heading">
                <strong>${escapeHtml(name)}</strong>
                <span>${number.format(category.count)} <small>units</small></span>
              </div>
              <div class="manager-category-track" role="img" aria-label="${percent}% of fleet">
                <span style="width:${percent}%"></span>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
  } else {
    setChartMessage(categoriesList, utilizationResult.data?.error || "Equipment categories could not be loaded.", true);
  }

  const now = new Date();
  const months = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (7 - index), 1));
    const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const month = date.toISOString().slice(0, 7);
    const startDate = date.toISOString().slice(0, 10);
    const endDate = new Date(nextMonth.getTime() - 86400000).toISOString().slice(0, 10);
    return { month, startDate, endDate, label: date.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) };
  });

  const [revenueResponses, bookingResponses] = await Promise.all([
    Promise.all(months.map(({ month }) => api(`/manager/reports/revenue/monthly?month=${month}`))),
    Promise.all(months.map(({ startDate, endDate }) =>
      api(`/manager/bookings?status=All&page=1&limit=1&startDate=${startDate}&endDate=${endDate}`)
    ))
  ]);

  if (revenueResponses.every((result) => result.ok) && revenueChart) {
    const series = months.map((month, index) => ({
      ...month,
      value: Number(revenueResponses[index].data?.rentalRevenue) || 0
    }));
    const max = Math.max(...series.map((item) => item.value), 1);
    revenueChart.innerHTML = `
      <div class="manager-chart-bars" role="img" aria-label="Rental revenue for the last eight months">
        ${series.map((item) => `
          <div class="manager-chart-column" title="${escapeHtml(item.label)}: ${escapeHtml(currency.format(item.value))}">
            <span class="manager-chart-value">${escapeHtml(currency.format(item.value))}</span>
            <span class="manager-chart-bar" style="height:${Math.max(4, item.value / max * 100)}%"></span>
            <span class="manager-chart-label">${escapeHtml(item.label)}</span>
          </div>
        `).join("")}
      </div>
    `;
  } else {
    setChartMessage(revenueChart, "Revenue history could not be loaded.", true);
  }

  if (bookingResponses.every((result) => result.ok) && bookingsChart) {
    const series = months.map((month, index) => ({
      ...month,
      value: Number(bookingResponses[index].data?.total) || 0
    }));
    const max = Math.max(...series.map((item) => item.value), 1);
    bookingsChart.innerHTML = `
      <div class="manager-chart-bars manager-booking-bars" role="img" aria-label="Booking requests by scheduled month">
        ${series.map((item) => `
          <div class="manager-chart-column" title="${escapeHtml(item.label)}: ${number.format(item.value)} bookings">
            <span class="manager-chart-value">${number.format(item.value)}</span>
            <span class="manager-chart-bar" style="height:${Math.max(4, item.value / max * 100)}%"></span>
            <span class="manager-chart-label">${escapeHtml(item.label)}</span>
          </div>
        `).join("")}
      </div>
    `;
  } else {
    setChartMessage(bookingsChart, "Booking history could not be loaded.", true);
  }
}

// Manager dashboard: render booking approvals (from MongoDB) and issue cards.
async function initManagerPage() {
  const isAdminCoverage = new URLSearchParams(window.location.search).get("coverage") === "admin";
  const accountRole = sessionStorage.getItem("minders-account-role") || "member";
  const hasAccess = sessionStorage.getItem("minders-member-auth") === "true" && (isAdminCoverage ? accountRole === "admin" : accountRole === "manager");
  if (!hasAccess) {
    window.location.replace("login.html");
    return;
  }
  initManagerDashboardWidgets().catch((error) => {
    console.error("Manager dashboard widgets failed to render:", error);
    const message = "Dashboard data could not be displayed. Refresh the page or check the server logs.";
    ["#manager-field-alerts", "#manager-issues", "#dashboard-pending-list", "#manager-category-distribution", "#manager-revenue-chart", "#manager-bookings-chart"]
      .forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.textContent = message;
          element.classList.add("is-error");
        }
      });
  });

  const pageFeedback = document.querySelector("#manager-page-feedback");
  const table = document.querySelector("#approval-table");
  const count = document.querySelector("#pending-count");
  const queueNote = document.querySelector(".table-note");
  const activeRentalsCountEl = document.querySelector("#active-rentals-count");
  const cashTotalEl = document.querySelector("#cash-intake-total");
  let loadMachineryUnits = null;
  let loadManagerCalendar = null;
  let loadManagerReports = null;
  let machineryUnitsData = [];

  // Field issues are loaded from the manager API below.
  const issuesEl = document.querySelector("#manager-issues");
  if (issuesEl) issuesEl.innerHTML = '<p class="manager-empty-state">Loading field alerts...</p>';

  // Today's date header
  const todayDateEl = document.querySelector("#manager-today-date");
  if (todayDateEl) {
    todayDateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }

  // ── Manager Menu View Switching (Same style as Admin, no scrolling down) ──
  const managerViews = {
    "overview": { label: "Dashboard", selector: "#manager-view-overview" },
    "approvals": { label: "Bookings & Operations", selector: "#approvals" },
    "bookings": { label: "Bookings", selector: "#approvals" },
    "maintenance": { label: "Farm Machinery & Units", selector: "#maintenance" },
    "units": { label: "Farm Machinery & Units", selector: "#maintenance" },
    "calendar": { label: "Machinery Calendar & Google Sync", selector: "#calendar" },
    "clients": { label: "Clients", selector: "#analytics" },
    "drivers": { label: "Drivers", selector: "#approvals" },
    "financials": { label: "Financials", selector: "#analytics" },
    "pos-terminal": { label: "Point of Sale (POS)", selector: "#approvals" },
    "reports": { label: "Operations & Financial Reports", selector: "#reports" },
    "tracking": { label: "Fleet Tracking", selector: "#maintenance" },
    "analytics": { label: "Utilization & Ledger", selector: "#analytics" },
    "messages": { label: "Messages & Incidents", selector: "#issues" },
    "issues": { label: "Field Health & Issues", selector: "#issues" }
  };

  function switchManagerView(targetKey) {
    if (!targetKey || !managerViews[targetKey]) targetKey = "overview";

    // Update sidebar active link
    document.querySelectorAll(".admin-nav-link[data-view]").forEach((link) => {
      link.classList.toggle("active", link.dataset.view === targetKey);
    });

    // Update topbar breadcrumb
    const breadcrumb = document.querySelector("#manager-topbar-breadcrumb");
    if (breadcrumb) breadcrumb.textContent = managerViews[targetKey].label;

    // Show only the selected view panel and hide others
    const targetSelector = managerViews[targetKey].selector;
    document.querySelectorAll(".manager-view-panel").forEach((panel) => {
      panel.style.display = panel.matches(targetSelector) ? "block" : "none";
    });

    // If pos-terminal view is opened, expand the POS container inside approvals
    if (targetKey === "pos-terminal") {
      const posContainer = document.querySelector("#pos-terminal-container");
      if (posContainer) posContainer.style.display = "block";
      const btnPosText = document.querySelector("#btn-toggle-pos-text");
      if (btnPosText) btnPosText.textContent = "✕ Close POS";
    }

    // Refresh machinery units when navigating to units
    if ((targetKey === "units" || targetKey === "maintenance") && typeof loadMachineryUnits === "function") {
      loadMachineryUnits();
    }

    // Refresh calendar & sync status when navigating to calendar
    if (targetKey === "calendar" && typeof loadManagerCalendar === "function") {
      loadManagerCalendar();
    }

    // Refresh reports when navigating to reports
    if (targetKey === "reports" && typeof loadManagerReports === "function") {
      loadManagerReports();
    }

    // Prevent scrolling down: stay pinned cleanly to top
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // Attach listener to all menu links and internal shortcuts
  document.querySelectorAll("a[data-view], .admin-sidebar a[href^='#'], a.admin-quick-btn[href^='#'], .admin-card a[href^='#']").forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#") && href.length > 1) {
        e.preventDefault();
        const targetKey = link.dataset.view || href.substring(1);
        try {
          history.replaceState(null, "", `#${targetKey}`);
        } catch (_) {}
        switchManagerView(targetKey);
      }
    });
  });

  // ================= 5. TWO-WAY GOOGLE CALENDAR & SCHEDULE SYNC =================
  let calendarBookings = [];
  let calendarMaintenance = [];
  let calCurrentDate = new Date();
  let calSelectedDayStr = null;

  const googleBadgeEl = document.querySelector("#google-calendar-badge");
  const btnConnectGoogle = document.querySelector("#btn-connect-google-calendar");
  const btnSyncGoogle = document.querySelector("#btn-sync-google-calendar");
  const btnDisconnectGoogle = document.querySelector("#btn-disconnect-google-calendar");
  const calDaysContainer = document.querySelector("#manager-calendar-days");
  const calMonthTitle = document.querySelector("#cal-month-title");
  const calDetailList = document.querySelector("#calendar-detail-list");
  const calDetailHeading = document.querySelector("#calendar-detail-heading");
  const calEventCountBadge = document.querySelector("#calendar-event-count-badge");

  const formatIsoDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const updateGoogleSyncStatus = async () => {
    try {
      const res = await api("/calendar/status");
      const dotEl = document.querySelector("#google-badge-dot");
      const textEl = document.querySelector("#google-badge-text");
      if (res.ok && res.data && (res.data.connected || res.data.isConnected)) {
        if (googleBadgeEl) googleBadgeEl.className = "google-sync-badge is-connected";
        if (dotEl) dotEl.style.background = "#10b981";
        if (textEl) textEl.textContent = `● Synced with Google Calendar (${res.data.email || "Primary"})`;
        if (btnConnectGoogle) btnConnectGoogle.style.display = "none";
        if (btnSyncGoogle) btnSyncGoogle.style.display = "inline-flex";
        if (btnDisconnectGoogle) btnDisconnectGoogle.style.display = "inline";
      } else {
        if (googleBadgeEl) googleBadgeEl.className = "google-sync-badge is-disconnected";
        if (dotEl) dotEl.style.background = "#dc2626";
        if (textEl) textEl.textContent = "● Not connected to Google Calendar";
        if (btnConnectGoogle) btnConnectGoogle.style.display = "inline-flex";
        if (btnSyncGoogle) btnSyncGoogle.style.display = "none";
        if (btnDisconnectGoogle) btnDisconnectGoogle.style.display = "none";
      }
    } catch (err) {
      console.warn("Failed to check Google Calendar status:", err);
    }
  };

  const handleCalendarUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get("google");
    if (!googleStatus) return;

    if (googleStatus === "connected") {
      setFeedback(pageFeedback, "✓ Google Calendar connected successfully! Bookings and maintenance are now in two-way sync.");
    } else if (googleStatus === "denied") {
      setFeedback(pageFeedback, "Google Calendar authorization was cancelled.");
    } else if (googleStatus === "error") {
      const detail = params.get("message") || "Authentication failed.";
      alert(`Google Calendar connection error: ${detail}`);
    }

    try {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}
  };

  if (btnConnectGoogle) {
    btnConnectGoogle.addEventListener("click", () => {
      window.location.href = "/api/calendar/connect";
    });
  }

  if (btnSyncGoogle) {
    btnSyncGoogle.addEventListener("click", async () => {
      const origText = btnSyncGoogle.innerHTML;
      btnSyncGoogle.innerHTML = "<span>Syncing...</span>";
      btnSyncGoogle.disabled = true;

      try {
        const res = await api("/calendar/sync-now", { method: "POST" });
        if (res.ok) {
          setFeedback(pageFeedback, `✓ Synced with Google Calendar (${res.data.syncedBookings || 0} bookings, ${res.data.syncedMaintenance || 0} maintenance).`);
          if (typeof loadManagerCalendar === "function") loadManagerCalendar();
        } else {
          alert(res.data.error || "Sync failed.");
        }
      } catch (err) {
        alert("Failed to sync with Google Calendar: " + err.message);
      } finally {
        btnSyncGoogle.innerHTML = origText;
        btnSyncGoogle.disabled = false;
      }
    });
  }

  if (btnDisconnectGoogle) {
    btnDisconnectGoogle.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to disconnect Google Calendar synchronization?")) return;
      try {
        const res = await api("/calendar/disconnect", { method: "POST" });
        if (res.ok) {
          setFeedback(pageFeedback, "Google Calendar has been disconnected.");
          updateGoogleSyncStatus();
        } else {
          alert(res.data.error || "Disconnect failed.");
        }
      } catch (err) {
        alert("Disconnect error: " + err.message);
      }
    });
  }

  document.querySelector("#cal-prev-btn")?.addEventListener("click", () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
    renderCalendarGrid();
  });

  document.querySelector("#cal-next-btn")?.addEventListener("click", () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
    renderCalendarGrid();
  });

  document.querySelector("#cal-today-btn")?.addEventListener("click", () => {
    calCurrentDate = new Date();
    calSelectedDayStr = null;
    renderCalendarGrid();
    renderCalendarDetailList();
  });

  const renderCalendarGrid = () => {
    if (!calDaysContainer) return;

    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();

    if (calMonthTitle) {
      calMonthTitle.textContent = calCurrentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const todayStr = formatIsoDate(new Date());

    let html = "";

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const d = new Date(year, month - 1, dayNum);
      const isoStr = formatIsoDate(d);
      html += renderDayCell(dayNum, isoStr, true, todayStr);
    }

    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const isoStr = formatIsoDate(d);
      html += renderDayCell(dayNum, isoStr, false, todayStr);
    }

    const currentCells = firstDayIndex + totalDaysInMonth;
    const remainingCells = currentCells % 7 === 0 ? 0 : 7 - (currentCells % 7);
    for (let dayNum = 1; dayNum <= remainingCells; dayNum++) {
      const d = new Date(year, month + 1, dayNum);
      const isoStr = formatIsoDate(d);
      html += renderDayCell(dayNum, isoStr, true, todayStr);
    }

    calDaysContainer.innerHTML = html;

    calDaysContainer.querySelectorAll(".cal-day-cell").forEach((cell) => {
      cell.addEventListener("click", () => {
        calDaysContainer.querySelectorAll(".cal-day-cell").forEach((c) => c.style.outline = "none");
        cell.style.outline = "2px solid #0d766e";
        calSelectedDayStr = cell.dataset.date;
        renderCalendarDetailList(calSelectedDayStr);
      });
    });
  };

  const renderDayCell = (dayNum, isoStr, isOtherMonth, todayStr) => {
    const isToday = isoStr === todayStr;
    const classes = ["cal-day-cell"];
    if (isOtherMonth) classes.push("is-other-month");
    if (isToday) classes.push("is-today");

    const dayBookings = calendarBookings.filter((b) => {
      const start = formatIsoDate(b.startDate);
      const end = formatIsoDate(b.endDate) || start;
      const st = (b.status || "").toLowerCase();
      if (st === "rejected" || st === "cancelled") return false;
      return start <= isoStr && isoStr <= end;
    });

    const dayMaintenance = calendarMaintenance.filter((m) => {
      const start = formatIsoDate(m.startDate);
      const end = formatIsoDate(m.endDate) || start;
      return start <= isoStr && isoStr <= end;
    });

    const allEventsCount = dayBookings.length + dayMaintenance.length;
    let chipsHtml = "";
    const maxChips = 2;
    let displayed = 0;

    dayBookings.forEach((b) => {
      if (displayed < maxChips) {
        const equipName = b.equipment || "Equipment";
        const farmer = b.memberName ? ` (${b.memberName})` : "";
        chipsHtml += `<div class="cal-chip cal-chip-rental" title="${escapeHtml(equipName + farmer)}">🚜 ${escapeHtml(equipName)}</div>`;
        displayed++;
      }
    });

    dayMaintenance.forEach((m) => {
      if (displayed < maxChips) {
        const name = m.equipmentName || m.equipmentUnitId || "Maintenance";
        chipsHtml += `<div class="cal-chip cal-chip-maintenance" title="${escapeHtml(name + ' - ' + (m.maintenanceType || 'Service'))}">🔧 ${escapeHtml(name)}</div>`;
        displayed++;
      }
    });

    if (allEventsCount > maxChips) {
      chipsHtml += `<span style="font-size:0.65rem; color:#64748b; font-weight:700; padding:1px 4px;">+${allEventsCount - maxChips} more</span>`;
    }

    return `
      <div class="${classes.join(" ")}" data-date="${isoStr}">
        <span class="cal-day-num">${dayNum}</span>
        <div style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">
          ${chipsHtml}
        </div>
      </div>
    `;
  };

  const renderCalendarDetailList = (filterDate = null) => {
    if (!calDetailList) return;

    let filteredBookings = calendarBookings.filter((b) => {
      const st = (b.status || "").toLowerCase();
      return st !== "rejected" && st !== "cancelled";
    });
    let filteredMaint = calendarMaintenance;

    if (filterDate) {
      if (calDetailHeading) calDetailHeading.textContent = `Schedule for ${new Date(filterDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}`;
      filteredBookings = filteredBookings.filter((b) => {
        const s = formatIsoDate(b.startDate);
        const e = formatIsoDate(b.endDate) || s;
        return s <= filterDate && filterDate <= e;
      });
      filteredMaint = filteredMaint.filter((m) => {
        const s = formatIsoDate(m.startDate);
        const e = formatIsoDate(m.endDate) || s;
        return s <= filterDate && filterDate <= e;
      });
    } else {
      if (calDetailHeading) calDetailHeading.textContent = "Active Schedules & Dispatches (All Upcoming)";
    }

    const totalCount = filteredBookings.length + filteredMaint.length;
    if (calEventCountBadge) calEventCountBadge.textContent = `${totalCount} event${totalCount === 1 ? "" : "s"}`;

    if (totalCount === 0) {
      calDetailList.innerHTML = `<p style="margin:0; font-size:0.78rem; color:#64748b; padding:12px; text-align:center;">No rental bookings or maintenance events scheduled for this period.</p>`;
      return;
    }

    let itemsHtml = "";

    filteredBookings.forEach((b) => {
      const dates = formatApplicationDates(b.startDate, b.endDate);
      const isGoogleSynced = Boolean(b.googleCalendarEventId);
      itemsHtml += `
        <div class="cal-detail-item" style="border-left-color: #10b981;">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.78rem; font-weight:800; color:#0f172a;">🚜 ${escapeHtml(b.equipment || "Farm Machinery")}</span>
              <span class="status-badge ${b.status === "Approved" ? "status-approved" : "status-active"}" style="font-size:0.68rem; padding:2px 7px;">${escapeHtml(b.status || "Approved")}</span>
              ${isGoogleSynced ? '<span style="font-size:0.68rem; color:#0d766e; font-weight:700;">✓ Synced to Google</span>' : ''}
            </div>
            <div style="font-size:0.75rem; color:#475569; margin-top:3px;">
              Member: <strong>${escapeHtml(b.memberName || "Member")}</strong> (${escapeHtml(b.memberEmail || "")}) &bull; Dates: <strong>${dates}</strong>
            </div>
          </div>
          <div style="font-size:0.72rem; color:#64748b; text-align:right;">
            Booking ID: <strong class="font-mono text-slate-800">${escapeHtml(b.displayId || String(b._id || b.id).slice(-6).toUpperCase())}</strong>
          </div>
        </div>
      `;
    });

    filteredMaint.forEach((m) => {
      const isGoogleSynced = Boolean(m.googleCalendarEventId);
      itemsHtml += `
        <div class="cal-detail-item" style="border-left-color: #ef4444;">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.78rem; font-weight:800; color:#b91c1c;">🔧 ${escapeHtml(m.equipmentName || "Machinery Unit")}</span>
              <span class="status-badge status-rejected" style="font-size:0.68rem; padding:2px 7px;">${escapeHtml(m.maintenanceType || "Maintenance")}</span>
              ${isGoogleSynced ? '<span style="font-size:0.68rem; color:#0d766e; font-weight:700;">✓ Synced to Google</span>' : ''}
            </div>
            <div style="font-size:0.75rem; color:#475569; margin-top:3px;">
              Unit: <strong>${escapeHtml(m.equipmentUnitId)}</strong> &bull; Period: <strong>${m.startDate} &rarr; ${m.endDate}</strong> &bull; Reason: ${escapeHtml(m.reason || "Scheduled inspection")}
            </div>
          </div>
          <div style="font-size:0.72rem; color:#64748b; text-align:right;">
            Status: <strong style="color:#ef4444;">Out of Service</strong>
          </div>
        </div>
      `;
    });

    calDetailList.innerHTML = itemsHtml;
  };

  loadManagerCalendar = async () => {
    updateGoogleSyncStatus();

    try {
      const [appsRes, maintRes] = await Promise.all([
        api("/applications"),
        api("/manager/machinery-maintenance")
      ]);

      calendarBookings = (appsRes.ok && Array.isArray(appsRes.data)) ? appsRes.data : [];
      calendarMaintenance = (maintRes.ok && Array.isArray(maintRes.data)) ? maintRes.data : [];
    } catch (err) {
      console.warn("Failed to load events for manager calendar:", err);
    }

    renderCalendarGrid();
    renderCalendarDetailList(calSelectedDayStr);
  };

  // Immediate synchronous initial render of month grid & params check
  renderCalendarGrid();
  handleCalendarUrlParams();
  updateGoogleSyncStatus();

  // ================= 6. OPERATIONS & FINANCIAL REPORTS =================
  const repPeriodTypeSelect = document.querySelector("#report-period-type");
  const repMonthInput = document.querySelector("#report-param-month");
  const repDateInput = document.querySelector("#report-param-date");
  const repYearInput = document.querySelector("#report-param-year");
  const btnRunReport = document.querySelector("#btn-run-report");
  const btnExportCsv = document.querySelector("#btn-export-report-csv");
  const repStatRevenue = document.querySelector("#rep-stat-revenue");
  const repStatPeriodLabel = document.querySelector("#rep-stat-period-label");
  const repStatTxCount = document.querySelector("#rep-stat-tx-count");
  const repStatAvgValue = document.querySelector("#rep-stat-avg-value");
  const repCategoryList = document.querySelector("#rep-category-list");
  const repTxTable = document.querySelector("#rep-transactions-table");
  const repTableCount = document.querySelector("#rep-table-count");

  const nowReport = new Date();
  const currentMonthStr = `${nowReport.getFullYear()}-${String(nowReport.getMonth() + 1).padStart(2, "0")}`;
  const currentDateStr = `${currentMonthStr}-${String(nowReport.getDate()).padStart(2, "0")}`;
  if (repMonthInput) repMonthInput.value = currentMonthStr;
  if (repDateInput) repDateInput.value = currentDateStr;
  if (repYearInput) repYearInput.value = nowReport.getFullYear();

  repPeriodTypeSelect?.addEventListener("change", (e) => {
    const val = e.target.value;
    if (repMonthInput) repMonthInput.style.display = val === "monthly" ? "inline-block" : "none";
    if (repDateInput) repDateInput.style.display = val === "daily" ? "inline-block" : "none";
    if (repYearInput) repYearInput.style.display = val === "annual" ? "inline-block" : "none";
    loadManagerReports();
  });

  const getReportQueryParam = () => {
    const period = repPeriodTypeSelect ? repPeriodTypeSelect.value : "monthly";
    if (period === "daily") {
      const d = repDateInput?.value || currentDateStr;
      return { period: "daily", param: `date=${encodeURIComponent(d)}` };
    }
    if (period === "annual") {
      const y = repYearInput?.value || nowReport.getFullYear();
      return { period: "annual", param: `year=${encodeURIComponent(y)}` };
    }
    const m = repMonthInput?.value || currentMonthStr;
    return { period: "monthly", param: `month=${encodeURIComponent(m)}` };
  };

  btnExportCsv?.addEventListener("click", () => {
    const { period, param } = getReportQueryParam();
    window.location.href = `/api/manager/reports/revenue/${period}?${param}&format=csv`;
  });

  btnRunReport?.addEventListener("click", () => {
    loadManagerReports();
  });

  loadManagerReports = async () => {
    const { period, param } = getReportQueryParam();
    
    // 1. Fetch revenue report
    try {
      const { ok, data } = await api(`/manager/reports/revenue/${period}?${param}`);
      if (ok && data) {
        if (repStatRevenue) repStatRevenue.textContent = `₱${Number(data.rentalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (repStatPeriodLabel) repStatPeriodLabel.textContent = data.range?.label || "Selected period";
        if (repStatTxCount) repStatTxCount.textContent = data.transactionCount || 0;
        
        const count = data.transactionCount || 0;
        const avg = count > 0 ? (Number(data.rentalRevenue || 0) / count) : 0;
        if (repStatAvgValue) repStatAvgValue.textContent = `₱${avg.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (repCategoryList && data.totalsByType) {
          const types = Object.entries(data.totalsByType);
          if (types.length === 0) {
            repCategoryList.innerHTML = `<p style="margin:0; font-size:0.8rem; color:#64748b;">No collections recorded for this period.</p>`;
          } else {
            repCategoryList.innerHTML = types.map(([type, total]) => {
              const pct = data.rentalRevenue > 0 ? Math.min(100, Math.round((total / data.rentalRevenue) * 100)) : 0;
              return `
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:700; margin-bottom:3px;">
                    <span>${escapeHtml(type)}</span>
                    <span style="color:#047857; font-family:monospace; font-weight:800;">+₱${Number(total).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)</span>
                  </div>
                  <div style="width:100%; height:7px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:#0d766e; border-radius:999px;"></div>
                  </div>
                </div>
              `;
            }).join("");
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load revenue report:", err);
    }

    // 2. Fetch completed transactions for the table
    try {
      const { ok: okTx, data: txData } = await api("/manager/transactions");
      if (okTx && txData && repTxTable) {
        const list = txData.transactions || [];
        if (repTableCount) repTableCount.textContent = `${list.length} records`;
        if (list.length === 0) {
          repTxTable.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:#64748b; font-size:0.8rem;">No transactions recorded for this period.</td></tr>`;
        } else {
          repTxTable.innerHTML = list.map((tx) => `
            <tr>
              <td><strong class="font-mono text-slate-900">${escapeHtml(tx.txId)}</strong><small style="display:block; font-size:0.72rem; color:#64748b;">${escapeHtml(tx.time)}</small></td>
              <td><strong>${escapeHtml(tx.farmer)}</strong></td>
              <td>${escapeHtml(tx.equipment)}</td>
              <td><span class="status-badge ${tx.type === "Rental Fee" ? "status-approved" : tx.type === "Deposit" ? "status-active" : "status-rejected"}">${escapeHtml(tx.type)}</span></td>
              <td><strong>${escapeHtml(tx.paymentMethod)}</strong></td>
              <td class="align-right font-mono" style="font-weight:800; color:#047857;">+₱${Number(tx.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          `).join("");
        }
      }
    } catch (err) {
      console.warn("Failed to load transactions for report:", err);
    }
  };

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace(/^#/, "");
    switchManagerView(hash || "overview");
  });

  const initialHash = window.location.hash.replace(/^#/, "") || "overview";
  switchManagerView(initialHash);

  // Manager identity sync
  if (isAdminCoverage) {
    const covBanner = document.querySelector("#admin-coverage-banner");
    if (covBanner) covBanner.hidden = false;
    document.querySelector("#manager-user-avatar").textContent = "SA";
    document.querySelector("#manager-user-name").textContent = "System admin";
    if (document.querySelector("#manager-user-email")) document.querySelector("#manager-user-email").textContent = getSignedInEmail() || "admin@minders.test";
    document.querySelector("#manager-page-eyebrow").textContent = "ADMIN COVERAGE / GREEN VALLEY CO-OP";
    document.querySelector("#manager-page-title").textContent = "Manager coverage active.";
    document.querySelector("#manager-page-description").textContent = "Review and approve or reject equipment applications while the manager is unavailable.";
  } else {
    const { ok, data } = await api(accountPath(getSignedInEmail()));
    if (ok) {
      const managerName = data.fullName || "Manager";
      document.querySelector("#manager-user-avatar").textContent = getInitials(managerName);
      document.querySelector("#manager-user-name").textContent = managerName;
      if (document.querySelector("#manager-user-email")) document.querySelector("#manager-user-email").textContent = data.email || getSignedInEmail();
      document.querySelector("#manager-page-title").textContent = `Good morning, ${managerName.trim().split(/\s+/)[0]}.`;
    }
  }

  // ================= 1. RENTAL OPERATIONS & INSPECTIONS =================
  const inspectionDialog = document.querySelector("#inspection-dialog");
  const inspectionForm = document.querySelector("#inspection-form");
  const inspectionModalTitle = document.querySelector("#inspection-modal-title");
  const inspectionAppIdInput = document.querySelector("#inspection-app-id");
  const inspectionTypeInput = document.querySelector("#inspection-type");
  const inspectionEquipName = document.querySelector("#inspection-equipment-name");
  const inspectionFarmerName = document.querySelector("#inspection-farmer-name");
  const inspectOdometer = document.querySelector("#inspect-odometer");
  const inspectFuel = document.querySelector("#inspect-fuel");
  const inspectNotes = document.querySelector("#inspect-notes");
  const inspectPhotosFile = document.querySelector("#inspect-photos-file");
  const inspectPhotoCountPreview = document.querySelector("#inspect-photo-count-preview");
  const submitInspectionBtn = document.querySelector("#submit-inspection-btn");

  document.querySelector("#close-inspection-dialog")?.addEventListener("click", () => inspectionDialog?.close());
  document.querySelector("#cancel-inspection-dialog")?.addEventListener("click", () => inspectionDialog?.close());

  inspectPhotosFile?.addEventListener("change", () => {
    const num = inspectPhotosFile.files ? inspectPhotosFile.files.length : 0;
    if (inspectPhotoCountPreview) {
      inspectPhotoCountPreview.textContent = num > 0 ? `✓ ${num} condition verification photo${num > 1 ? "s" : ""} attached.` : "No photos selected yet.";
      inspectPhotoCountPreview.style.color = num > 0 ? "#059669" : "#64748b";
      inspectPhotoCountPreview.style.fontWeight = num > 0 ? "700" : "normal";
    }
  });

  const openInspectionModal = (appId, equipName, farmerName, type) => {
    inspectionForm?.reset();
    if (inspectionAppIdInput) inspectionAppIdInput.value = appId;
    if (inspectionTypeInput) inspectionTypeInput.value = type;
    if (inspectionEquipName) inspectionEquipName.textContent = equipName;
    if (inspectionFarmerName) inspectionFarmerName.textContent = farmerName;
    if (inspectPhotoCountPreview) inspectPhotoCountPreview.textContent = "No photos selected yet.";

    if (type === "checkout") {
      if (inspectionModalTitle) inspectionModalTitle.textContent = "Pre-Rental Handover Inspection";
      if (submitInspectionBtn) submitInspectionBtn.textContent = "Confirm Handover & Release Unit";
      if (inspectNotes) inspectNotes.placeholder = "Confirm hydraulic lines intact, lights functioning, tire condition...";
    } else {
      if (inspectionModalTitle) inspectionModalTitle.textContent = "Post-Rental Check-In Inspection";
      if (submitInspectionBtn) submitInspectionBtn.textContent = "Complete Return & Close Contract";
      if (inspectNotes) inspectNotes.placeholder = "Verify equipment cleanliness, report scratches, damages, or missing pins...";
    }

    inspectionDialog?.showModal();
  };

  inspectionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const appId = inspectionAppIdInput?.value;
    const type = inspectionTypeInput?.value || "checkout";
    const odometerHours = inspectOdometer?.value;
    const fuelLevel = inspectFuel?.value;
    const notes = inspectNotes?.value;
    const photoCount = inspectPhotosFile?.files ? inspectPhotosFile.files.length : 0;
    const managerEmail = getSignedInEmail() || "manager@minders.test";

    const res = await api(`/applications/${encodeURIComponent(appId)}/inspection`, {
      method: "PATCH",
      body: { type, odometerHours, fuelLevel, notes, photoCount, managerEmail }
    });

    if (res.ok) {
      inspectionDialog?.close();
      setFeedback(pageFeedback, type === "checkout" ? "Check-out handover inspection recorded. Unit is now active in field." : "Check-in inspection recorded and rental contract closed.");
      renderBookings();
    } else {
      alert(res.data.error || "Failed to record inspection.");
    }
  });

  const renderBookings = async () => {
    const { ok, data } = await api("/applications");
    const memberApplications = (ok && Array.isArray(data) ? data : []).map((application) => ({
      id: application.displayId || `APP-${String(application.id || application._id).slice(-6).toUpperCase()}`,
      applicationId: application.id || application._id,
      member: application.memberName || "Member",
      email: application.memberEmail,
      equipment: application.equipment,
      dates: formatApplicationDates(application.startDate, application.endDate),
      submitted: application.submittedAt ? new Date(application.submittedAt).toLocaleDateString() : (application.createdAt ? new Date(application.createdAt).toLocaleDateString() : "Recently"),
      status: application.status || "Pending",
      rawDate: application.createdAt || application.submittedAt || 0,
      isReal: true
    }));

    // Real MongoDB applications first: Pending first, then newest first
    memberApplications.sort((a, b) => {
      if (a.status === "Pending" && b.status !== "Pending") return -1;
      if (b.status === "Pending" && a.status !== "Pending") return 1;
      return new Date(b.rawDate || 0) - new Date(a.rawDate || 0);
    });

    const allBookings = memberApplications.length > 0 ? memberApplications : bookings;
    table.innerHTML = allBookings.map((booking) => {
      const isPending = booking.status === "Pending";
      const isApproved = booking.status === "Approved";
      const isCheckedOut = booking.status === "Checked-Out";
      const isReturned = booking.status === "Returned";

      let statusBadgeClass = "status-pending";
      if (isApproved) statusBadgeClass = "status-approved";
      if (isCheckedOut) statusBadgeClass = "status-active";
      if (isReturned) statusBadgeClass = "status-completed";
      if (booking.status === "Rejected") statusBadgeClass = "status-rejected";
      if (booking.status === "Cancelled") statusBadgeClass = "status-cancelled";

      let actionButtons = "";
      if (isPending) {
        actionButtons = `
          <button class="action-button approve-button" data-booking-action="Approved" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}">Approve</button>
          <button class="action-button reject-button" data-booking-action="Rejected" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}">Reject</button>
        `;
      } else if (isApproved && booking.applicationId) {
        actionButtons = `
          <button class="action-button" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-weight:700;" data-open-inspect="checkout" data-app-id="${escapeHtml(booking.applicationId)}" data-equip="${escapeHtml(booking.equipment)}" data-farmer="${escapeHtml(booking.member)}">
            📷 Handover Check-Out
          </button>
        `;
      } else if (isCheckedOut && booking.applicationId) {
        actionButtons = `
          <button class="action-button" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:700;" data-open-inspect="checkin" data-app-id="${escapeHtml(booking.applicationId)}" data-equip="${escapeHtml(booking.equipment)}" data-farmer="${escapeHtml(booking.member)}">
            📋 Return &amp; Close
          </button>
        `;
      } else if (isReturned) {
        actionButtons = `<span style="font-size:0.75rem; color:#64748b; font-style:italic;">Contract Closed</span>`;
      } else if (booking.status === "Cancelled") {
        actionButtons = `<span style="font-size:0.75rem; color:#64748b; font-style:italic;">Cancelled by member</span>`;
      } else {
        actionButtons = `<span style="font-size:0.75rem; color:#94a3b8;">${escapeHtml(booking.status)}</span>`;
      }

      return `<tr>
        <td><strong>${escapeHtml(booking.member)}</strong><small>${escapeHtml(booking.email ? `${booking.email} • ${booking.id}` : booking.id)}</small></td>
        <td>${escapeHtml(booking.equipment)}</td>
        <td>${booking.dates}</td>
        <td>${booking.submitted}</td>
        <td><span class="status-badge ${statusBadgeClass}">${booking.status}</span></td>
        <td class="align-right"><div class="action-group">${actionButtons}</div></td>
      </tr>`;
    }).join("");

    const pendingCount = allBookings.filter((b) => b.status === "Pending").length;
    const checkedOutCount = allBookings.filter((b) => b.status === "Checked-Out").length;
    if (count) count.textContent = pendingCount;
    if (queueNote) queueNote.textContent = `${pendingCount} request${pendingCount === 1 ? "" : "s"} in queue`;
    const sidebarBadge = document.querySelector("#sidebar-manager-pending-badge");
    if (sidebarBadge) sidebarBadge.textContent = pendingCount;
    if (activeRentalsCountEl) activeRentalsCountEl.textContent = 18 + checkedOutCount;

    // Standard approve/reject listener
    table.querySelectorAll("[data-booking-action]").forEach((btn) => btn.addEventListener("click", async () => {
      if (btn.dataset.applicationId) {
        const result = await api(`/applications/${encodeURIComponent(btn.dataset.applicationId)}`, {
          method: "PATCH",
          body: { status: btn.dataset.bookingAction, actorEmail: getSignedInEmail() }
        });
        if (result.ok) renderBookings();
        return;
      }
      const b = bookings.find((item) => item.id === btn.dataset.bookingId);
      if (b) { b.status = btn.dataset.bookingAction; renderBookings(); }
    }));

    // Inspection modal buttons listener
    table.querySelectorAll("[data-open-inspect]").forEach((btn) => btn.addEventListener("click", () => {
      openInspectionModal(btn.dataset.appId, btn.dataset.equip, btn.dataset.farmer, btn.dataset.openInspect);
    }));
  };

  renderBookings();
  window.setInterval(renderBookings, 15000);

  // ================= 2. POINT OF SALE (POS) TABS & CALCULATORS =================
  const btnTogglePos = document.querySelector("#btn-toggle-pos");
  const btnTogglePosText = document.querySelector("#btn-toggle-pos-text");
  const btnClosePosPanel = document.querySelector("#btn-close-pos-panel");
  const posTerminalContainer = document.querySelector("#pos-terminal-container");

  const togglePosPanel = (forceState) => {
    if (!posTerminalContainer) return;
    const isCurrentlyHidden = posTerminalContainer.style.display === "none" || !posTerminalContainer.style.display;
    const shouldOpen = forceState !== undefined ? forceState : isCurrentlyHidden;
    posTerminalContainer.style.display = shouldOpen ? "block" : "none";
    if (btnTogglePosText) {
      btnTogglePosText.textContent = shouldOpen ? "✕ Close POS" : "+ Point of Sale (POS)";
    }
    if (btnTogglePos) {
      btnTogglePos.style.background = shouldOpen ? "#475569" : "#d97706";
    }
  };

  btnTogglePos?.addEventListener("click", () => {
    togglePosPanel();
    if (typeof populatePosAvailableEquipment === "function") {
      populatePosAvailableEquipment();
    }
  });
  btnClosePosPanel?.addEventListener("click", () => togglePosPanel(false));

  const posTabWalkin = document.querySelector("#pos-tab-walkin");
  const posTabSettlement = document.querySelector("#pos-tab-settlement");
  const posWalkinPanel = document.querySelector("#pos-walkin-panel");
  const posSettlementPanel = document.querySelector("#pos-settlement-panel");

  posTabWalkin?.addEventListener("click", () => {
    if (posWalkinPanel) posWalkinPanel.style.display = "block";
    if (posSettlementPanel) posSettlementPanel.style.display = "none";
    posTabWalkin.style.background = "#fffbeb";
    posTabWalkin.style.borderColor = "#d97706";
    posTabWalkin.style.color = "#92400e";
    posTabSettlement.style.background = "transparent";
    posTabSettlement.style.borderColor = "var(--line)";
    posTabSettlement.style.color = "var(--ink-soft)";
  });

  posTabSettlement?.addEventListener("click", () => {
    if (posWalkinPanel) posWalkinPanel.style.display = "none";
    if (posSettlementPanel) posSettlementPanel.style.display = "block";
    posTabSettlement.style.background = "#fffbeb";
    posTabSettlement.style.borderColor = "#d97706";
    posTabSettlement.style.color = "#92400e";
    posTabWalkin.style.background = "transparent";
    posTabWalkin.style.borderColor = "var(--line)";
    posTabWalkin.style.color = "var(--ink-soft)";
  });

  // ================= 2. POINT OF SALE (POS) DYNAMIC FLEET & CALCULATIONS =================
  const posEquipSelect = document.querySelector("#pos-equipment-select");
  const posRentalType = document.querySelector("#pos-rental-type");
  const posGroupDayStart = document.querySelector("#pos-group-day-start");
  const posGroupDayEnd = document.querySelector("#pos-group-day-end");
  const posGroupHourDate = document.querySelector("#pos-group-hour-date");
  const posGroupHourDuration = document.querySelector("#pos-group-hour-duration");
  const posStartDateInput = document.querySelector("#pos-start-date");
  const posEndDateInput = document.querySelector("#pos-end-date");
  const posHourDateInput = document.querySelector("#pos-hour-date");
  const posHoursCountInput = document.querySelector("#pos-hours-count");
  const posRateLabel = document.querySelector("#pos-rate-label");
  const posRateInput = document.querySelector("#pos-rate-input");
  const posSubtotalEl = document.querySelector("#pos-breakdown-subtotal");
  const posDurationEl = document.querySelector("#pos-breakdown-duration");
  const posTotalEl = document.querySelector("#pos-breakdown-total");

  // Prevent past dates: lock date pickers minimum to today
  const todayIso = new Date().toISOString().split("T")[0];
  const in3DaysIso = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];

  if (posStartDateInput) {
    posStartDateInput.min = todayIso;
    posStartDateInput.value = todayIso;
  }
  if (posEndDateInput) {
    posEndDateInput.min = todayIso;
    posEndDateInput.value = in3DaysIso;
  }
  if (posHourDateInput) {
    posHourDateInput.min = todayIso;
    posHourDateInput.value = todayIso;
  }

  // Populate equipment from Units fleet (status === 'Available')
  let populatePosAvailableEquipment = async () => {
    if (!posEquipSelect) return;
    let units = machineryUnitsData;
    if (!units || !units.length) {
      try {
        const { ok, data } = await api("/machinery-units");
        if (ok && data) {
          units = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
          machineryUnitsData = units;
        }
      } catch (_) {}
    }

    const availableUnits = (units || []).filter((u) => u.status === "Available" && !u.isArchived);

    if (!availableUnits.length) {
      posEquipSelect.innerHTML = `<option value="">⚠️ No available machinery in units fleet</option>`;
      if (posRateInput) posRateInput.value = "0";
      updatePosWalkinTotal();
      return;
    }

    const currentVal = posEquipSelect.value;
    posEquipSelect.innerHTML = availableUnits.map((u) => {
      const rateDay = Number(u.ratePerDay) || 1200;
      const rateHour = Number(u.ratePerHour) || Math.round(rateDay / 8) || 150;
      const label = `${u.unitId} - ${u.name} (${u.category || "Machinery"})`;
      const isSelected = u.name === currentVal ? "selected" : "";
      return `<option value="${escapeHtml(u.name)}" data-unit-id="${escapeHtml(u.unitId)}" data-rate-day="${rateDay}" data-rate-hour="${rateHour}" ${isSelected}>${escapeHtml(label)}</option>`;
    }).join("");

    updateRateFromSelectedUnit();
    updatePosWalkinTotal();
  };

  const updateRateFromSelectedUnit = () => {
    if (!posEquipSelect || !posRateInput) return;
    const selectedOpt = posEquipSelect.options[posEquipSelect.selectedIndex];
    if (!selectedOpt) return;
    const isHourly = posRentalType?.value === "hour";
    if (isHourly) {
      const rateHour = Number(selectedOpt.dataset.rateHour) || 150;
      posRateInput.value = rateHour;
    } else {
      const rateDay = Number(selectedOpt.dataset.rateDay) || 1200;
      posRateInput.value = rateDay;
    }
  };

  const updatePosWalkinTotal = () => {
    const isHourly = posRentalType?.value === "hour";
    const rate = Number(posRateInput?.value) || 0;

    let subtotal = 0;
    let durationText = "1 day";

    if (isHourly) {
      const hours = Math.max(1, Number(posHoursCountInput?.value) || 1);
      subtotal = rate * hours;
      durationText = `${hours} hr${hours === 1 ? "" : "s"}`;
    } else {
      const d1 = new Date(posStartDateInput?.value || todayIso);
      const d2 = new Date(posEndDateInput?.value || todayIso);
      const diffDays = Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));
      subtotal = rate * diffDays;
      durationText = `${diffDays} day${diffDays === 1 ? "" : "s"}`;
    }

    if (posDurationEl) posDurationEl.textContent = durationText;
    if (posSubtotalEl) posSubtotalEl.textContent = `₱${subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (posTotalEl) posTotalEl.textContent = `₱${subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Toggle Duration Type: Per Day vs Per Hour
  posRentalType?.addEventListener("change", () => {
    const isHourly = posRentalType.value === "hour";
    if (posGroupDayStart) posGroupDayStart.style.display = isHourly ? "none" : "block";
    if (posGroupDayEnd) posGroupDayEnd.style.display = isHourly ? "none" : "block";
    if (posGroupHourDate) posGroupHourDate.style.display = isHourly ? "block" : "none";
    if (posGroupHourDuration) posGroupHourDuration.style.display = isHourly ? "block" : "none";

    if (posStartDateInput) posStartDateInput.required = !isHourly;
    if (posEndDateInput) posEndDateInput.required = !isHourly;
    if (posHourDateInput) posHourDateInput.required = isHourly;

    if (posRateLabel) {
      posRateLabel.textContent = isHourly ? "Hourly Rate (₱ / Hour)" : "Daily Rate (₱ / Day)";
    }

    updateRateFromSelectedUnit();
    updatePosWalkinTotal();
  });

  posEquipSelect?.addEventListener("change", () => {
    updateRateFromSelectedUnit();
    updatePosWalkinTotal();
  });

  posRateInput?.addEventListener("input", updatePosWalkinTotal);
  posHoursCountInput?.addEventListener("input", updatePosWalkinTotal);

  // Date validation: enforce cannot rent past / done dates
  posStartDateInput?.addEventListener("change", () => {
    if (posStartDateInput.value < todayIso) {
      alert("Cannot rent for a past date. Start date reset to today.");
      posStartDateInput.value = todayIso;
    }
    if (posEndDateInput) {
      posEndDateInput.min = posStartDateInput.value;
      if (posEndDateInput.value < posStartDateInput.value) {
        posEndDateInput.value = posStartDateInput.value;
      }
    }
    updatePosWalkinTotal();
  });

  posEndDateInput?.addEventListener("change", () => {
    if (posStartDateInput && posEndDateInput.value < posStartDateInput.value) {
      alert("Rental end date cannot be earlier than start date.");
      posEndDateInput.value = posStartDateInput.value;
    }
    updatePosWalkinTotal();
  });

  posHourDateInput?.addEventListener("change", () => {
    if (posHourDateInput.value < todayIso) {
      alert("Cannot rent for a past date. Date reset to today.");
      posHourDateInput.value = todayIso;
    }
    updatePosWalkinTotal();
  });

  // Call populate on init
  populatePosAvailableEquipment();

  document.querySelector("#pos-walkin-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const farmerName = document.querySelector("#pos-farmer-name")?.value?.trim();
    const farmerPhone = document.querySelector("#pos-farmer-phone")?.value?.trim();
    const coopId = document.querySelector("#pos-coop-id")?.value?.trim() || "WALK-IN";
    const selectedOpt = posEquipSelect?.options[posEquipSelect.selectedIndex];
    const equipment = posEquipSelect?.value;
    const machineryUnitId = selectedOpt?.dataset.unitId || "";

    if (!equipment) {
      alert("Please select an available machinery unit from the fleet.");
      return;
    }

    const rentalType = posRentalType?.value || "day";
    const isHourly = rentalType === "hour";
    const startDate = isHourly ? posHourDateInput?.value : posStartDateInput?.value;
    const endDate = isHourly ? posHourDateInput?.value : posEndDateInput?.value;

    if (!startDate || !endDate) {
      alert("Please select valid rental dates.");
      return;
    }

    if (startDate < todayIso) {
      alert("Cannot book for a past date. The date has already passed.");
      return;
    }

    if (endDate < startDate) {
      alert("Rental end date cannot be earlier than start date.");
      return;
    }

    const rate = Number(posRateInput?.value) || 0;
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    const rentalDays = isHourly ? 1 : Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));
    const rentalHours = isHourly ? Math.max(1, Number(posHoursCountInput?.value) || 1) : 0;
    const paymentMethod = document.querySelector("#pos-payment-method")?.value || "Cash";

    const res = await api("/manager/pos-booking", {
      method: "POST",
      body: {
        farmerName,
        farmerPhone,
        coopId,
        equipment,
        machineryUnitId,
        rentalType,
        startDate,
        endDate,
        rate,
        dailyRate: rate,
        deposit: 0,
        rentalDays,
        rentalHours,
        paymentMethod,
        managerEmail: getSignedInEmail()
      }
    });

    if (res.ok) {
      alert(`Walk-in booking confirmed for ${farmerName}.\nMachinery: ${equipment} (${machineryUnitId})\nDuration: ${isHourly ? `${rentalHours} hr(s)` : `${rentalDays} day(s)`}\nTotal Collected: ₱${Number(res.data.totalCollected).toLocaleString("en-PH", { minimumFractionDigits: 2 })}\nDeposit: ₱0.00 (Zero Deposit)\nReceipt: ${res.data.txId}`);
      document.querySelector("#pos-farmer-name").value = "";
      document.querySelector("#pos-farmer-phone").value = "";
      document.querySelector("#pos-coop-id").value = "";
      if (posStartDateInput) posStartDateInput.value = todayIso;
      if (posEndDateInput) posEndDateInput.value = in3DaysIso;
      if (posHourDateInput) posHourDateInput.value = todayIso;
      updateRateFromSelectedUnit();
      updatePosWalkinTotal();
      renderBookings();
      loadLedgerAndUtilization();
      if (typeof loadMachineryUnits === "function") loadMachineryUnits();
    } else {
      alert(res.data.error || "Failed to process walk-in booking.");
    }
  });

  // POS Settlement live calculation
  const settleDepositInput = document.querySelector("#settle-initial-deposit");
  const settleLateDaysInput = document.querySelector("#settle-late-days");
  const settleRepairInput = document.querySelector("#settle-repair-cost");
  const settleFuelInput = document.querySelector("#settle-fuel-charge");
  const settleOutcomeLabel = document.querySelector("#settle-outcome-label");
  const settleOutcomeDetails = document.querySelector("#settle-outcome-details");
  const settleNetAmount = document.querySelector("#settle-net-amount");
  const settleSummaryCard = document.querySelector("#settle-summary-card");

  const updateSettlementCalculation = () => {
    const dep = Number(settleDepositInput?.value) || 0;
    const lateDays = Number(settleLateDaysInput?.value) || 0;
    const lateFee = lateDays * 40;
    const repair = Number(settleRepairInput?.value) || 0;
    const fuel = Number(settleFuelInput?.value) || 0;
    const deductions = lateFee + repair + fuel;
    const net = dep - deductions;
    const isRefund = net >= 0;

    if (settleOutcomeLabel) {
      settleOutcomeLabel.textContent = isRefund ? "Deposit Refund to Farmer" : "Balance Due from Farmer";
      settleOutcomeLabel.style.color = isRefund ? "#065f46" : "#9f1239";
    }
    if (settleOutcomeDetails) {
      settleOutcomeDetails.textContent = `Initial Deposit: ₱${dep.toFixed(2)} − Total Deductions: ₱${deductions.toFixed(2)}`;
      settleOutcomeDetails.style.color = isRefund ? "#047857" : "#be123c";
    }
    if (settleNetAmount) {
      settleNetAmount.textContent = isRefund ? `+₱${net.toFixed(2)}` : `-₱${Math.abs(net).toFixed(2)}`;
      settleNetAmount.style.color = isRefund ? "#047857" : "#be123c";
    }
    if (settleSummaryCard) {
      settleSummaryCard.style.background = isRefund ? "#ecfdf5" : "#fff1f2";
      settleSummaryCard.style.borderColor = isRefund ? "#a7f3d0" : "#fecdd3";
    }
  };

  settleDepositInput?.addEventListener("input", updateSettlementCalculation);
  settleLateDaysInput?.addEventListener("input", updateSettlementCalculation);
  settleRepairInput?.addEventListener("input", updateSettlementCalculation);
  settleFuelInput?.addEventListener("input", updateSettlementCalculation);
  updateSettlementCalculation();

  document.querySelector("#pos-settlement-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rentalId = document.querySelector("#settle-rental-id")?.value;
    const initialDeposit = Number(settleDepositInput?.value) || 0;
    const lateDays = Number(settleLateDaysInput?.value) || 0;
    const repairCost = Number(settleRepairInput?.value) || 0;
    const fuelCharge = Number(settleFuelInput?.value) || 0;
    const deductionNotes = document.querySelector("#settle-deduction-notes")?.value;

    const res = await api("/manager/pos-settlement", {
      method: "POST",
      body: { rentalId, initialDeposit, lateDays, lateFeePerDay: 40, repairCost, fuelCharge, deductionNotes, managerEmail: getSignedInEmail() }
    });

    if (res.ok) {
      alert(res.data.message);
      document.querySelector("#pos-settlement-form")?.reset();
      updateSettlementCalculation();
      renderBookings();
      loadLedgerAndUtilization();
    } else {
      alert(res.data.error || "Settlement failed.");
    }
  });

  // ================= 3. FARM MACHINERY & UNITS FLEET MANAGEMENT =================
  machineryUnitsData = [];
  let currentMachineryStatusFilter = "All";
  let currentMachineryCategoryFilter = "All";
  let currentMachinerySearch = "";
  let currentMachineryView = "grid";

  const machineryGridEl = document.querySelector("#machinery-grid-container");
  const machineryTableBodyEl = document.querySelector("#machinery-table-body");
  const machineryTableContainerEl = document.querySelector("#machinery-table-container");

  const statTotalEl = document.querySelector("#machinery-stat-total");
  const statAvailEl = document.querySelector("#machinery-stat-available");
  const statMaintEl = document.querySelector("#machinery-stat-maintenance");
  const statRepairEl = document.querySelector("#machinery-stat-repair");
  const statDisposeEl = document.querySelector("#machinery-stat-dispose");

  const pillCountAll = document.querySelector("#pill-count-all");
  const pillCountAvail = document.querySelector("#pill-count-avail");
  const pillCountMaint = document.querySelector("#pill-count-maint");
  const pillCountRepair = document.querySelector("#pill-count-repair");
  const pillCountDispose = document.querySelector("#pill-count-dispose");

  const machineryModal = document.querySelector("#machinery-modal");
  const machineryForm = document.querySelector("#machinery-form");
  const machineryModalTitle = document.querySelector("#machinery-modal-title");
  const machineryDocIdInput = document.querySelector("#machinery-doc-id");
  const machineryFormModeInput = document.querySelector("#machinery-form-mode");
  const btnDeleteMachinery = document.querySelector("#btn-delete-machinery");
  const machineryImgUrlInput = document.querySelector("#machinery-image-url");
  const machineryPreviewImg = document.querySelector("#machinery-modal-preview-img");
  const machineryPreviewPh = document.querySelector("#machinery-modal-preview-ph");

  const machineryImgFileInput = document.querySelector("#machinery-image-file");
  const machineryImgFilename = document.querySelector("#machinery-image-filename");
  const categorySelect = document.querySelector("#machinery-category");
  const categoryOtherWrap = document.querySelector("#machinery-category-other-wrap");
  const categoryOtherInput = document.querySelector("#machinery-category-other");

  function updateModalImgPreview(url) {
    if (url && url.trim().length > 5) {
      if (machineryPreviewImg) {
        machineryPreviewImg.src = url.trim();
        machineryPreviewImg.style.display = "block";
      }
      if (machineryPreviewPh) machineryPreviewPh.style.display = "none";
    } else {
      if (machineryPreviewImg) {
        machineryPreviewImg.src = "";
        machineryPreviewImg.style.display = "none";
      }
      if (machineryPreviewPh) machineryPreviewPh.style.display = "inline";
    }
  }

  machineryImgUrlInput?.addEventListener("input", (e) => {
    updateModalImgPreview(e.target.value);
  });

  // Local File Upload with Immediate Base64 Data URL Preview
  machineryImgFileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (machineryImgFilename) machineryImgFilename.textContent = `Selected: ${file.name}`;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      if (machineryImgUrlInput) machineryImgUrlInput.value = base64;
      updateModalImgPreview(base64);
    };
    reader.readAsDataURL(file);
  });

  // Category "Other" Dynamic Input Field Toggle
  categorySelect?.addEventListener("change", () => {
    if (categorySelect.value === "Other") {
      if (categoryOtherWrap) categoryOtherWrap.style.display = "block";
      categoryOtherInput?.focus();
    } else {
      if (categoryOtherWrap) categoryOtherWrap.style.display = "none";
      if (categoryOtherInput) categoryOtherInput.value = "";
    }
  });

  const updateMachineryStats = () => {
    const total = machineryUnitsData.length;
    const avail = machineryUnitsData.filter((u) => u.status === "Available").length;
    const maint = machineryUnitsData.filter((u) => u.status === "Maintenance").length;
    const repair = machineryUnitsData.filter((u) => u.status === "Repair").length;
    const dispose = machineryUnitsData.filter((u) => u.status === "Dispose").length;

    if (statTotalEl) statTotalEl.textContent = total;
    if (statAvailEl) statAvailEl.textContent = avail;
    if (statMaintEl) statMaintEl.textContent = maint;
    if (statRepairEl) statRepairEl.textContent = repair;
    if (statDisposeEl) statDisposeEl.textContent = dispose;

    if (pillCountAll) pillCountAll.textContent = total;
    if (pillCountAvail) pillCountAvail.textContent = avail;
    if (pillCountMaint) pillCountMaint.textContent = maint;
    if (pillCountRepair) pillCountRepair.textContent = repair;
    if (pillCountDispose) pillCountDispose.textContent = dispose;

    // Also update overview widget if present
    const overviewMaintCount = document.querySelector("#maintenance-units-count");
    if (overviewMaintCount) overviewMaintCount.textContent = maint + repair;
  };

  const renderMachineryGrid = (units) => {
    if (!machineryGridEl) return;

    if (!units.length) {
      machineryGridEl.innerHTML = `
        <div style="grid-column: 1 / -1; background: #fff; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 36px 20px; text-align: center; color: #64748b;">
          <strong style="color: #1e293b; font-size: 0.95rem; display: block; margin-bottom: 4px;">No machinery units found</strong>
          <p style="font-size: 0.8rem; margin: 0;">Try adjusting your status filter or search query, or click Add Unit above.</p>
        </div>
      `;
      return;
    }

    machineryGridEl.innerHTML = units.map((unit) => {
      const imgHtml = unit.imageUrl
        ? `<img src="${escapeHtml(unit.imageUrl)}" class="machinery-card-img" alt="${escapeHtml(unit.name)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'machinery-card-placeholder\\'>No photo available</span>';">`
        : `<span class="machinery-card-placeholder">No photo available</span>`;

      return `
        <div class="machinery-card" data-card-id="${unit._id}">
          <!-- Top Bar: Unit Code and Actions outside body -->
          <div class="machinery-card-top">
            <span class="machinery-unit-code">${escapeHtml(unit.unitId)}</span>
            <div class="machinery-card-actions">
              <select class="machinery-quick-select" data-quick-id="${unit._id}" title="Change Status">
                <option value="Available" ${unit.status === "Available" ? "selected" : ""}>Available</option>
                <option value="Maintenance" ${unit.status === "Maintenance" ? "selected" : ""}>Maintenance</option>
                <option value="Repair" ${unit.status === "Repair" ? "selected" : ""}>Repair</option>
                <option value="Dispose" ${unit.status === "Dispose" ? "selected" : ""}>Dispose</option>
              </select>
              <button type="button" class="machinery-edit-btn" data-edit-id="${unit._id}">Edit</button>
            </div>
          </div>

          <!-- Machinery Photo (No floating badges, clean) -->
          <div class="machinery-card-media">
            ${imgHtml}
          </div>

          <!-- Card Body: Clean typography, no colored containers, no icons, no actions -->
          <div class="machinery-card-body">
            <div class="machinery-card-category">${escapeHtml(unit.category || "Machinery")}${unit.modelYear ? ` · ${escapeHtml(unit.modelYear)}` : ""}</div>
            <h3 class="machinery-card-title">${escapeHtml(unit.name)}</h3>

            <div class="machinery-details-row">
              <span class="machinery-detail-label">Driver</span>
              <span class="machinery-detail-val">${escapeHtml(unit.assignedDriver || "Unassigned")}</span>
            </div>

            <div class="machinery-details-row">
              <span class="machinery-detail-label">Rate / Day</span>
              <span class="machinery-detail-val">₱${Number(unit.ratePerDay || 0).toLocaleString()} <small>/day</small></span>
            </div>

            <div class="machinery-details-row">
              <span class="machinery-detail-label">Rate / Hour</span>
              <span class="machinery-detail-val">₱${Number(unit.ratePerHour || 0).toLocaleString()} <small>/hr</small></span>
            </div>

            ${unit.operatingHours ? `
              <div class="machinery-details-row">
                <span class="machinery-detail-label">Hours Logged</span>
                <span class="machinery-detail-val">${Number(unit.operatingHours).toLocaleString()} hrs</span>
              </div>
            ` : ""}

            ${unit.conditionNotes ? `<p class="machinery-card-notes" title="${escapeHtml(unit.conditionNotes)}">${escapeHtml(unit.conditionNotes)}</p>` : ""}
          </div>
        </div>
      `;
    }).join("");

    attachMachineryCardListeners();
  };

  const renderMachineryTable = (units) => {
    if (!machineryTableBodyEl) return;

    if (!units.length) {
      machineryTableBodyEl.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">No machinery units matched the current filters.</td></tr>`;
      return;
    }

    machineryTableBodyEl.innerHTML = units.map((unit) => {
      const isUnassigned = !unit.assignedDriver || unit.assignedDriver.toLowerCase() === "unassigned";
      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:40px; height:32px; border-radius:4px; overflow:hidden; background:#f1f5f9; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${unit.imageUrl ? `<img src="${escapeHtml(unit.imageUrl)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none';">` : `<span style="font-size:0.65rem; color:#94a3b8;">No photo</span>`}
              </div>
              <div>
                <strong style="display:block; font-size:0.86rem; color:#0f172a;">${escapeHtml(unit.name)}</strong>
                <span class="font-mono" style="font-size:0.7rem; color:#475569; font-weight:600;">${escapeHtml(unit.unitId)}</span>
              </div>
            </div>
          </td>
          <td><span style="font-size:0.78rem; color:#475569;">${escapeHtml(unit.category || "Tractor")}</span></td>
          <td>
            <div style="font-size:0.82rem; ${isUnassigned ? "color:#94a3b8;" : "color:#1e293b; font-weight:500;"}">
              ${escapeHtml(unit.assignedDriver || "Unassigned")}
            </div>
          </td>
          <td>
            <div style="font-size:0.8rem; font-weight:600; color:#0f172a;">
              ₱${Number(unit.ratePerDay || 0).toLocaleString()} <small style="color:#64748b; font-weight:400;">/day</small>
            </div>
            <div style="font-size:0.74rem; color:#64748b;">
              ₱${Number(unit.ratePerHour || 0).toLocaleString()} <small>/hr</small>
            </div>
          </td>
          <td>
            <select class="machinery-quick-select" data-quick-id="${unit._id}" style="max-width:130px;">
              <option value="Available" ${unit.status === "Available" ? "selected" : ""}>Available</option>
              <option value="Maintenance" ${unit.status === "Maintenance" ? "selected" : ""}>Maintenance</option>
              <option value="Repair" ${unit.status === "Repair" ? "selected" : ""}>Repair</option>
              <option value="Dispose" ${unit.status === "Dispose" ? "selected" : ""}>Dispose</option>
            </select>
          </td>
          <td style="max-width:200px; font-size:0.75rem; color:#64748b;">
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(unit.conditionNotes || "—")}</div>
          </td>
          <td class="align-right">
            <button type="button" class="machinery-edit-btn" data-edit-id="${unit._id}">
              Edit
            </button>
          </td>
        </tr>
      `;
    }).join("");

    attachMachineryCardListeners();
  };

  const applyMachineryFilters = () => {
    let filtered = [...machineryUnitsData];

    if (currentMachineryStatusFilter !== "All") {
      filtered = filtered.filter((u) => u.status === currentMachineryStatusFilter);
    }

    if (currentMachineryCategoryFilter !== "All") {
      filtered = filtered.filter((u) => u.category === currentMachineryCategoryFilter);
    }

    if (currentMachinerySearch.trim()) {
      const q = currentMachinerySearch.trim().toLowerCase();
      filtered = filtered.filter((u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.unitId && u.unitId.toLowerCase().includes(q)) ||
        (u.assignedDriver && u.assignedDriver.toLowerCase().includes(q)) ||
        (u.category && u.category.toLowerCase().includes(q))
      );
    }

    if (currentMachineryView === "grid") {
      renderMachineryGrid(filtered);
    } else {
      renderMachineryTable(filtered);
    }
  };

  const attachMachineryCardListeners = () => {
    // Quick Status dropdowns
    document.querySelectorAll(".machinery-quick-select").forEach((select) => {
      select.addEventListener("change", async (e) => {
        const unitId = select.dataset.quickId;
        const newStatus = select.value;
        const unit = machineryUnitsData.find((u) => String(u._id) === String(unitId));
        if (!unit) return;

        const originalStatus = unit.status;
        unit.status = newStatus;
        updateMachineryStats();

        const res = await api(`/machinery-units/${encodeURIComponent(unitId)}/status`, {
          method: "PATCH",
          body: { status: newStatus, managerEmail: getSignedInEmail() }
        });

        if (res.ok) {
          setFeedback(pageFeedback, `Unit ${unit.unitId} (${unit.name}) status changed to ${newStatus}.`);
          applyMachineryFilters();
        } else {
          unit.status = originalStatus;
          updateMachineryStats();
          applyMachineryFilters();
          alert(res.data.error || "Failed to update machinery status.");
        }
      });
    });

    // Edit buttons
    document.querySelectorAll("[data-edit-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const unitId = btn.dataset.editId;
        const unit = machineryUnitsData.find((u) => String(u._id) === String(unitId));
        if (!unit) return;
        openMachineryModal("edit", unit);
      });
    });
  };

  const openMachineryModal = (mode, unit = null) => {
    machineryForm?.reset();
    if (machineryFormModeInput) machineryFormModeInput.value = mode;

    if (mode === "edit" && unit) {
      if (machineryModalTitle) machineryModalTitle.textContent = `Edit Machinery: ${unit.unitId}`;
      if (machineryDocIdInput) machineryDocIdInput.value = unit._id;
      if (btnDeleteMachinery) btnDeleteMachinery.style.display = "block";

      const setVal = (id, val) => {
        const el = document.querySelector(id);
        if (el) el.value = val !== undefined && val !== null ? val : "";
      };

      const standardCats = ["Tractor", "Harvester", "Baler", "Planter / Seeder", "Sprayer", "Mower / Rake", "Transport / Truck"];
      const catVal = unit.category || "Tractor";
      if (standardCats.includes(catVal)) {
        setVal("#machinery-category", catVal);
        if (categoryOtherWrap) categoryOtherWrap.style.display = "none";
        if (categoryOtherInput) categoryOtherInput.value = "";
      } else {
        setVal("#machinery-category", "Other");
        if (categoryOtherWrap) categoryOtherWrap.style.display = "block";
        if (categoryOtherInput) categoryOtherInput.value = catVal === "Other" ? "" : catVal;
      }

      setVal("#machinery-unit-id", unit.unitId);
      setVal("#machinery-name", unit.name);
      setVal("#machinery-status", unit.status || "Available");
      setVal("#machinery-driver", unit.assignedDriver || "Unassigned");
      setVal("#machinery-driver-phone", unit.driverPhone || "");
      setVal("#machinery-rate-day", unit.ratePerDay || 2500);
      setVal("#machinery-rate-hour", unit.ratePerHour || 400);
      setVal("#machinery-image-url", unit.imageUrl || "");
      setVal("#machinery-year", unit.modelYear || "2023");
      setVal("#machinery-serial", unit.serialNumber || "");
      setVal("#machinery-hours", unit.operatingHours || 0);
      setVal("#machinery-notes", unit.conditionNotes || "");

      if (machineryImgFileInput) machineryImgFileInput.value = "";
      if (machineryImgFilename) machineryImgFilename.textContent = "";
      updateModalImgPreview(unit.imageUrl || "");
    } else {
      // Add mode
      if (machineryModalTitle) machineryModalTitle.textContent = "Add New Machinery Unit";
      if (machineryDocIdInput) machineryDocIdInput.value = "";
      if (btnDeleteMachinery) btnDeleteMachinery.style.display = "none";

      const setVal = (id, val) => {
        const el = document.querySelector(id);
        if (el) el.value = val;
      };
      setVal("#machinery-unit-id", `UNIT-${Math.floor(1000 + Math.random() * 9000)}`);
      setVal("#machinery-status", "Available");
      setVal("#machinery-category", "Tractor");
      if (categoryOtherWrap) categoryOtherWrap.style.display = "none";
      if (categoryOtherInput) categoryOtherInput.value = "";
      setVal("#machinery-rate-day", 2800);
      setVal("#machinery-rate-hour", 450);
      setVal("#machinery-year", new Date().getFullYear());
      setVal("#machinery-driver", "Unassigned");
      if (machineryImgFileInput) machineryImgFileInput.value = "";
      if (machineryImgFilename) machineryImgFilename.textContent = "";
      updateModalImgPreview("");
    }

    machineryModal?.showModal();
  };

  // Machinery Modal Handlers
  document.querySelector("#btn-add-machinery")?.addEventListener("click", () => {
    openMachineryModal("add");
  });

  document.querySelector("#close-machinery-modal")?.addEventListener("click", () => machineryModal?.close());
  document.querySelector("#cancel-machinery-modal")?.addEventListener("click", () => machineryModal?.close());

  // Delete Machinery Unit
  btnDeleteMachinery?.addEventListener("click", async () => {
    const docId = machineryDocIdInput?.value;
    if (!docId) return;
    const unit = machineryUnitsData.find((u) => String(u._id) === String(docId));
    const unitName = unit ? `${unit.unitId} (${unit.name})` : "this unit";

    if (!confirm(`Are you sure you want to permanently delete ${unitName} from the fleet inventory?`)) return;

    const res = await api(`/machinery-units/${encodeURIComponent(docId)}`, {
      method: "DELETE",
      body: { managerEmail: getSignedInEmail() }
    });

    if (res.ok) {
      machineryModal?.close();
      setFeedback(pageFeedback, "Machinery unit successfully removed from fleet.");
      loadMachineryUnits();
    } else {
      alert(res.data.error || "Failed to delete machinery unit.");
    }
  });

  // Save Machinery Form
  machineryForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = machineryFormModeInput?.value || "edit";
    const docId = machineryDocIdInput?.value;

    const catSelectVal = document.querySelector("#machinery-category")?.value;
    const catOtherVal = document.querySelector("#machinery-category-other")?.value?.trim();
    const finalCategory = (catSelectVal === "Other" && catOtherVal) ? catOtherVal : (catSelectVal || "Other");

    const payload = {
      unitId: document.querySelector("#machinery-unit-id")?.value?.trim(),
      name: document.querySelector("#machinery-name")?.value?.trim(),
      category: finalCategory,
      status: document.querySelector("#machinery-status")?.value,
      assignedDriver: document.querySelector("#machinery-driver")?.value?.trim() || "Unassigned",
      driverPhone: document.querySelector("#machinery-driver-phone")?.value?.trim() || "",
      ratePerDay: Number(document.querySelector("#machinery-rate-day")?.value) || 0,
      ratePerHour: Number(document.querySelector("#machinery-rate-hour")?.value) || 0,
      imageUrl: document.querySelector("#machinery-image-url")?.value?.trim() || "",
      modelYear: document.querySelector("#machinery-year")?.value?.trim() || "",
      serialNumber: document.querySelector("#machinery-serial")?.value?.trim() || "",
      operatingHours: Number(document.querySelector("#machinery-hours")?.value) || 0,
      conditionNotes: document.querySelector("#machinery-notes")?.value?.trim() || "",
      managerEmail: getSignedInEmail()
    };

    let res;
    if (mode === "add") {
      res = await api("/machinery-units", {
        method: "POST",
        body: payload
      });
    } else {
      res = await api(`/machinery-units/${encodeURIComponent(docId)}`, {
        method: "PUT",
        body: payload
      });
    }

    if (res.ok) {
      machineryModal?.close();
      setFeedback(pageFeedback, mode === "add" ? `Added new machinery unit ${payload.unitId}.` : `Updated ${payload.unitId} (${payload.name}).`);
      loadMachineryUnits();
    } else {
      alert(res.data.error || "Failed to save machinery unit.");
    }
  });

  // Filter Status Pills click
  document.querySelectorAll(".machinery-status-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".machinery-status-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentMachineryStatusFilter = pill.dataset.statusFilter || "All";
      applyMachineryFilters();
    });
  });

  // Search Input live filter
  document.querySelector("#machinery-search-input")?.addEventListener("input", (e) => {
    currentMachinerySearch = e.target.value;
    applyMachineryFilters();
  });

  // Category Filter dropdown
  document.querySelector("#machinery-category-filter")?.addEventListener("change", (e) => {
    currentMachineryCategoryFilter = e.target.value;
    applyMachineryFilters();
  });

  // View Mode switches (Grid vs Table)
  const btnGrid = document.querySelector("#btn-machinery-grid-view");
  const btnTable = document.querySelector("#btn-machinery-table-view");

  btnGrid?.addEventListener("click", () => {
    currentMachineryView = "grid";
    btnGrid.classList.add("active");
    btnGrid.style.background = "#0d766e";
    btnGrid.style.color = "#fff";
    if (btnTable) {
      btnTable.classList.remove("active");
      btnTable.style.background = "transparent";
      btnTable.style.color = "#64748b";
    }
    if (machineryGridEl) machineryGridEl.style.display = "grid";
    if (machineryTableContainerEl) machineryTableContainerEl.style.display = "none";
    applyMachineryFilters();
  });

  btnTable?.addEventListener("click", () => {
    currentMachineryView = "table";
    btnTable.classList.add("active");
    btnTable.style.background = "#0d766e";
    btnTable.style.color = "#fff";
    if (btnGrid) {
      btnGrid.classList.remove("active");
      btnGrid.style.background = "transparent";
      btnGrid.style.color = "#64748b";
    }
    if (machineryGridEl) machineryGridEl.style.display = "none";
    if (machineryTableContainerEl) machineryTableContainerEl.style.display = "block";
    applyMachineryFilters();
  });

  loadMachineryUnits = async () => {
    const { ok, data } = await api("/machinery-units");
    const list = ok && data ? (Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : [])) : [];
    machineryUnitsData = list;
    updateMachineryStats();
    applyMachineryFilters();
    if (typeof populatePosAvailableEquipment === "function") {
      populatePosAvailableEquipment();
    }
  };

  // Initial load of machinery units
  loadMachineryUnits();

  // ── Scheduled Out of Service & Maintenance Overlap Protection ──
  const maintenanceDialog = document.querySelector("#maintenance-dialog");
  const maintenanceForm = document.querySelector("#maintenance-form");
  const maintenanceTable = document.querySelector("#maintenance-table");
  const maintBadgeEl = document.querySelector("#maintenance-count-badge");

  document.querySelector("#btn-open-maintenance-modal")?.addEventListener("click", () => {
    maintenanceForm?.reset();
    if (document.querySelector("#maint-start-date")) document.querySelector("#maint-start-date").value = todayIso;
    if (document.querySelector("#maint-end-date")) document.querySelector("#maint-end-date").value = in3DaysIso;
    maintenanceDialog?.showModal();
  });

  document.querySelector("#close-maintenance-dialog")?.addEventListener("click", () => maintenanceDialog?.close());
  document.querySelector("#cancel-maintenance-dialog")?.addEventListener("click", () => maintenanceDialog?.close());

  const loadMaintenanceRecords = async () => {
    const { ok, data } = await api("/manager/machinery-maintenance");
    const records = (ok && Array.isArray(data)) ? data : [];
    if (maintBadgeEl) maintBadgeEl.textContent = `${records.length} active`;

    if (!records.length) {
      if (maintenanceTable) maintenanceTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:18px; color:#64748b; font-size:0.8rem;">All equipment units are currently operational. No machinery is locked Out of Service.</td></tr>`;
      return;
    }

    if (maintenanceTable) {
      maintenanceTable.innerHTML = records.map((rec) => `
        <tr>
          <td><strong class="font-mono text-slate-800">${escapeHtml(rec.equipmentUnitId)}</strong></td>
          <td><strong>${escapeHtml(rec.equipmentName)}</strong></td>
          <td><span style="font-size:0.75rem; color:#475569; font-weight:600;">${escapeHtml(rec.maintenanceType)}</span></td>
          <td><span style="font-size:0.75rem;">${rec.startDate} &rarr; ${rec.endDate}</span></td>
          <td><span class="status-badge status-rejected">${escapeHtml(rec.status)}</span></td>
          <td style="max-width:200px; font-size:0.75rem; color:#64748b;">${escapeHtml(rec.reason)}</td>
          <td class="align-right">
            <button class="action-button approve-button" data-complete-maint="${rec._id}" style="background:#059669;">
              ✓ Return to Service
            </button>
          </td>
        </tr>
      `).join("");

      maintenanceTable.querySelectorAll("[data-complete-maint]").forEach((btn) => btn.addEventListener("click", async () => {
        if (!confirm("Complete maintenance and return this equipment unit to active operational service?")) return;
        const res = await api(`/manager/machinery-maintenance/${encodeURIComponent(btn.dataset.completeMaint)}`, {
          method: "DELETE",
          body: { managerEmail: getSignedInEmail() }
        });
        if (res.ok) {
          loadMaintenanceRecords();
          loadMachineryUnits();
          setFeedback(pageFeedback, "Machinery unit returned to active service.");
        }
      }));
    }
  };

  loadMaintenanceRecords();

  maintenanceForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const equipmentUnitId = document.querySelector("#maint-unit-id")?.value;
    const equipmentName = document.querySelector("#maint-equipment-name")?.value;
    const startDate = document.querySelector("#maint-start-date")?.value;
    const endDate = document.querySelector("#maint-end-date")?.value;
    const maintenanceType = document.querySelector("#maint-type")?.value;
    const reason = document.querySelector("#maint-reason")?.value;

    const res = await api("/manager/machinery-maintenance", {
      method: "POST",
      body: { equipmentUnitId, equipmentName, startDate, endDate, maintenanceType, reason, managerEmail: getSignedInEmail() }
    });

    if (res.ok) {
      maintenanceDialog?.close();
      loadMaintenanceRecords();
      loadMachineryUnits();
      alert(`Unit ${equipmentUnitId} (${equipmentName}) set Out of Service.\n${res.data.collidingBookingsCount ? `Note: ${res.data.collidingBookingsCount} existing booking(s) fall in this window.` : "No conflicting farmer bookings detected."}`);
    } else {
      alert(res.data.error || "Failed to schedule maintenance.");
    }
  });

  // ================= 4. UTILIZATION BARS & CASH RECONCILIATION LEDGER =================
  const loadLedgerAndUtilization = async () => {
    // 1. Equipment utilization bar chart
    const { ok: okUtil, data: utilData } = await api("/manager/utilization");
    const utilContainer = document.querySelector("#utilization-bars-container");
    if (utilContainer && okUtil && Array.isArray(utilData)) {
      utilContainer.innerHTML = utilData.map((cat) => {
        const rate = cat.utilizationRate || 0;
        let barColor = "#d97706";
        if (rate >= 80) barColor = "#059669";
        if (rate < 60) barColor = "#2563eb";

        return `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; margin-bottom:3px;">
              <span>${escapeHtml(cat.name)} <span style="font-weight:normal; color:#64748b;">(${cat.activeUnits}/${cat.totalUnits} deployed)</span></span>
              <span style="color:${barColor}; font-weight:800;">${rate}%</span>
            </div>
            <div style="width:100%; height:9px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
              <div style="width:${rate}%; height:100%; background:${barColor}; border-radius:999px; transition:width 0.8s ease;"></div>
            </div>
          </div>
        `;
      }).join("");
    }

    // 2. Daily Transactions ledger
    const { ok: okTx, data: txData } = await api("/manager/transactions");
    const ledgerTable = document.querySelector("#transaction-ledger-table");
    const ledgerTotalCash = document.querySelector("#ledger-total-cash");

    if (okTx && txData) {
      const txs = txData.transactions || [];
      if (cashTotalEl) cashTotalEl.textContent = `₱${(txData.totalCash || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (ledgerTotalCash) ledgerTotalCash.textContent = `₱${(txData.totalCash || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      if (ledgerTable) {
        ledgerTable.innerHTML = txs.map((tx) => `
          <tr>
            <td><strong class="font-mono text-slate-900">${escapeHtml(tx.txId)}</strong><small>${escapeHtml(tx.time)}</small></td>
            <td><strong>${escapeHtml(tx.farmer)}</strong></td>
            <td>${escapeHtml(tx.equipment)}</td>
            <td><span class="status-badge ${tx.type === "Rental Fee" ? "status-approved" : tx.type === "Deposit" ? "status-active" : "status-rejected"}">${escapeHtml(tx.type)}</span></td>
            <td><strong>${escapeHtml(tx.paymentMethod)}</strong></td>
            <td class="align-right font-mono" style="font-weight:800; color:#0f172a;">+₱${Number(tx.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `).join("");
      }
    }
  };

  loadLedgerAndUtilization();

  // Export ledger CSV
  document.querySelector("#btn-export-ledger-csv")?.addEventListener("click", async () => {
    const { ok, data } = await api("/manager/transactions");
    if (!ok || !data.transactions) return;
    const rows = [
      ["Transaction ID", "Time", "Farmer", "Equipment", "Category", "Payment Method", "Amount"],
      ...data.transactions.map((t) => [t.txId, t.time, t.farmer, t.equipment, t.type, t.paymentMethod, t.amount])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `minders-daily-ledger-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// Synchronize admin identity across all admin console sidebar headers
async function syncAdminSidebarUser() {
  const email = getSignedInEmail();
  if (!email) return;

  const avatarEl = document.querySelector("#sidebar-admin-avatar");
  const nameEl = document.querySelector("#sidebar-admin-name");
  const emailEl = document.querySelector("#sidebar-admin-email");

  const cachedName = sessionStorage.getItem("minders-account-name");
  if (cachedName) {
    if (nameEl) nameEl.textContent = cachedName;
    if (emailEl) emailEl.textContent = email;
    if (avatarEl) avatarEl.textContent = getInitials(cachedName);
  } else if (emailEl) {
    emailEl.textContent = email;
  }

  // Fetch verified profile from MongoDB
  const { ok, data } = await api(accountPath(email));
  if (ok && data) {
    const fullName = data.fullName || "Admin";
    sessionStorage.setItem("minders-account-name", fullName);
    sessionStorage.setItem("minders-member-email", data.email);
    sessionStorage.setItem("minders-account-role", data.role || "admin");

    if (nameEl) nameEl.textContent = fullName;
    if (emailEl) emailEl.textContent = data.email;
    if (avatarEl) avatarEl.textContent = getInitials(fullName);
  }
}

// Dedicated Admin Booking Approvals Page
async function initBookingApprovalsPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true" || sessionStorage.getItem("minders-account-role") !== "admin") {
    window.location.replace("login.html");
    return;
  }
  syncAdminSidebarUser();
  const table = document.querySelector("#approval-table");
  const count = document.querySelector("#pending-count");
  const queueNote = document.querySelector(".table-note");
  let currentFilter = "ALL";

  const renderBookings = async () => {
    const { ok, data } = await api("/applications");
    const memberApplications = (ok && Array.isArray(data) ? data : []).map((application) => ({
      id: application.displayId || `APP-${String(application.id || application._id).slice(-6).toUpperCase()}`,
      applicationId: application.id || application._id,
      member: application.memberName || "Member",
      email: application.memberEmail,
      equipment: application.equipment,
      dates: formatApplicationDates(application.startDate, application.endDate),
      submitted: application.submittedAt ? new Date(application.submittedAt).toLocaleString() : (application.createdAt ? new Date(application.createdAt).toLocaleString() : "Recently"),
      status: application.status || "Pending",
      rawDate: application.createdAt || application.submittedAt || 0,
      isReal: true
    }));

    // Sort: Pending applications first, then newest first
    memberApplications.sort((a, b) => {
      if (a.status === "Pending" && b.status !== "Pending") return -1;
      if (b.status === "Pending" && a.status !== "Pending") return 1;
      return new Date(b.rawDate || 0) - new Date(a.rawDate || 0);
    });

    // Real MongoDB applications first; fallback to mock data only if 0 applications exist
    const baseList = memberApplications.length > 0 ? memberApplications : bookings;
    const pendingCount = baseList.filter((b) => b.status === "Pending").length;
    if (count) count.textContent = pendingCount;
    if (queueNote) queueNote.textContent = `${pendingCount} pending in queue`;

    let displayList = baseList;
    if (currentFilter !== "ALL") {
      displayList = baseList.filter((b) => b.status === currentFilter);
    }

    if (!displayList.length) {
      table.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 36px 20px; color: #64748b; font-size: 0.88rem;">No ${currentFilter === "ALL" ? "" : currentFilter.toLowerCase() + " "}booking requests found in queue.</td></tr>`;
      return;
    }

    table.innerHTML = displayList.map((booking) => {
      let statusClass = "status-pending";
      if (booking.status === "Approved") statusClass = "status-approved";
      else if (booking.status === "Rejected") statusClass = "status-rejected";
      else if (booking.status === "Cancelled") statusClass = "status-cancelled";
      const isPending = booking.status === "Pending";
      const isApproved = booking.status === "Approved";
      const isRejected = booking.status === "Rejected";

      let actionButtons = "";
      if (isPending) {
        actionButtons = `
          <button class="action-button approve-button" data-booking-action="Approved" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}">Approve</button>
          <button class="action-button reject-button" data-booking-action="Rejected" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}">Reject</button>
        `;
      } else if (isApproved) {
        actionButtons = `
          <button class="action-button reject-button" data-booking-action="Rejected" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}" title="Revoke approval and mark rejected">Revoke / Reject</button>
        `;
      } else if (isRejected) {
        actionButtons = `
          <button class="action-button approve-button" data-booking-action="Approved" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}" title="Re-approve this application">Re-Approve</button>
        `;
      } else {
        actionButtons = `<span style="font-size:0.75rem; color:#94a3b8;">${escapeHtml(booking.status)}</span>`;
      }

      return `<tr>
        <td>
          <strong>${escapeHtml(booking.member)}</strong>
          <small>${escapeHtml(booking.email ? `${booking.email} • ${booking.id}` : booking.id)}</small>
        </td>
        <td>${escapeHtml(booking.equipment)}</td>
        <td>${booking.dates}</td>
        <td>${booking.submitted}</td>
        <td><span class="status-badge ${statusClass}">${booking.status}</span></td>
        <td class="align-right">
          <div class="action-group">
            ${actionButtons}
          </div>
        </td>
      </tr>`;
    }).join("");

    table.querySelectorAll("[data-booking-action]").forEach((button) => button.addEventListener("click", async () => {
      const targetAction = button.dataset.bookingAction;
      button.disabled = true;
      button.textContent = "Updating...";
      if (button.dataset.applicationId) {
        const result = await api(`/applications/${encodeURIComponent(button.dataset.applicationId)}`, {
          method: "PATCH",
          body: { status: targetAction, actorEmail: getSignedInEmail() || "admin@minders.test" }
        });
        if (result.ok) renderBookings();
        return;
      }
      const booking = bookings.find((item) => item.id === button.dataset.bookingId);
      if (booking) { booking.status = targetAction; renderBookings(); }
    }));
  };

  // Status Filter button listeners
  document.querySelectorAll("[data-booking-filter]").forEach((filterBtn) => {
    filterBtn.addEventListener("click", () => {
      currentFilter = filterBtn.dataset.bookingFilter;
      document.querySelectorAll("[data-booking-filter]").forEach((b) => {
        b.style.background = "transparent";
        b.style.color = "var(--ink)";
      });
      filterBtn.style.background = "#059669";
      filterBtn.style.color = "#ffffff";
      renderBookings();
    });
  });

  renderBookings();
  window.setInterval(renderBookings, 15000);
}

// Administrator dashboard: render the issue monitoring list, live MongoDB stats, and previews.
async function initAdminPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true" || sessionStorage.getItem("minders-account-role") !== "admin") {
    window.location.replace("login.html");
    return;
  }
  syncAdminSidebarUser();

  const icons = { "Equipment breakdown": "!", "Late return": "L", "Scheduling conflict": "S" };
  const issuesEl = document.querySelector("#admin-issues");
  if (issuesEl) {
    issuesEl.innerHTML = issueLogs.map((issue) => `<div class="monitor-row"><div class="monitor-type"><span>${icons[issue.type] || "!"}</span><strong>${issue.type}</strong></div><small>${issue.location}</small><strong>${issue.detail}</strong>${getIssueBadge(issue)}</div>`).join("");
  }

  // Load live accounts from MongoDB
  const { ok: okAccounts, data: accounts } = await api("/accounts");
  if (okAccounts && Array.isArray(accounts)) {
    const countEl = document.querySelector("#admin-stat-accounts");
    if (countEl) countEl.textContent = accounts.length;
    const badgeEl = document.querySelector("#sidebar-accounts-badge");
    if (badgeEl) badgeEl.textContent = accounts.length;

    const recentAccountsEl = document.querySelector("#admin-recent-accounts");
    if (recentAccountsEl) {
      recentAccountsEl.innerHTML = accounts.slice(0, 4).map((acc) => {
        const roleClass = acc.role === "admin" ? "avatar-forest" : acc.role === "manager" ? "avatar-amber" : "avatar-teal";
        const statusClass = acc.emailVerified ? "status-approved" : "status-pending";
        return `<div class="admin-preview-row">
          <div class="admin-preview-user">
            <span class="avatar ${roleClass}">${getInitials(acc.fullName || acc.email)}</span>
            <div>
              <strong>${escapeHtml(acc.fullName || "Member")}</strong>
              <small>${escapeHtml(acc.email)}</small>
            </div>
          </div>
          <span class="status-badge ${statusClass}">${acc.role}</span>
        </div>`;
      }).join("");
    }
  }

  // Load live applications from MongoDB
  const { ok: okApps, data: apps } = await api("/applications");
  if (okApps && Array.isArray(apps)) {
    const pendingApps = apps.filter((a) => a.status === "Pending");
    const pendingCountEl = document.querySelector("#admin-stat-applications");
    if (pendingCountEl) pendingCountEl.textContent = pendingApps.length;

    const recentAppsEl = document.querySelector("#admin-recent-applications");
    if (recentAppsEl) {
      if (!apps.length) {
        recentAppsEl.innerHTML = '<p class="muted" style="font-size:0.78rem; padding: 12px 0; margin: 0;">No equipment requests yet in MongoDB.</p>';
      } else {
        recentAppsEl.innerHTML = apps.slice(0, 4).map((app) => {
          const statusClass = app.status === "Approved" ? "status-approved" : app.status === "Rejected" ? "status-rejected" : "status-pending";
          return `<div class="admin-preview-row">
            <div>
              <strong>${escapeHtml(app.equipment)}</strong>
              <small>${escapeHtml(app.memberName)} (${formatApplicationDates(app.startDate, app.endDate)})</small>
            </div>
            <span class="status-badge ${statusClass}">${app.status}</span>
          </div>`;
        }).join("");
      }
    }
  }

  // Load live audit logs preview from MongoDB
  const { ok: okLogs, data: logs } = await api("/audit-logs?limit=4");
  if (okLogs && Array.isArray(logs)) {
    const auditBadge = document.querySelector("#sidebar-audit-badge");
    if (auditBadge) auditBadge.textContent = logs.length;

    const recentAuditEl = document.querySelector("#admin-recent-audit-logs");
    if (recentAuditEl) {
      if (!logs.length) {
        recentAuditEl.innerHTML = '<p class="muted" style="font-size:0.78rem; padding: 12px 0; margin: 0;">No audit events recorded yet.</p>';
      } else {
        recentAuditEl.innerHTML = logs.map((log) => {
          const actionClass = getAuditBadgeClass(log.action);
          return `<div class="admin-preview-row">
            <div>
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                <strong style="font-size: 0.8rem; color: var(--ink);">${escapeHtml(formatAuditAction(log.action))}</strong>
                <span style="font-size: 0.7rem; color: #64746f;">${new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <small>${escapeHtml(log.details)}</small>
            </div>
            <span class="status-badge ${log.status === "Success" ? "status-approved" : "status-rejected"}">${escapeHtml(log.status)}</span>
          </div>`;
        }).join("");
      }
    }
  }

  // Initialize Admin Settings modal for admin page
  initAdminSettingsDialog();
}

// System Settings & Authentication Configuration Modal (Global across all Admin views)
function initAdminSettingsDialog() {
  const dialog = document.querySelector("#sys-config-dialog");
  if (!dialog) return;

  const openButtons = document.querySelectorAll("#open-sys-settings, #open-sys-settings-2, #open-sys-config, #open-sys-config-2, a[href='#settings']");
  const toggleGoogleCheckbox = document.querySelector("#toggle-google-login-checkbox");
  const toggleGoogleActionBtn = document.querySelector("#btn-toggle-google-login-action");
  const statusGoogleBadge = document.querySelector("#google-login-status-badge");
  const stateGoogleLabel = document.querySelector("#google-login-state-label");

  const toggleFacebookCheckbox = document.querySelector("#toggle-facebook-login-checkbox");
  const toggleFacebookActionBtn = document.querySelector("#btn-toggle-facebook-login-action");
  const statusFacebookBadge = document.querySelector("#facebook-login-status-badge");
  const stateFacebookLabel = document.querySelector("#facebook-login-state-label");

  const feedbackEl = document.querySelector("#settings-save-feedback");

  let currentGoogleLoginState = true;
  let currentFacebookLoginState = true;

  function updateGoogleLoginUI(isEnabled) {
    currentGoogleLoginState = Boolean(isEnabled);
    if (toggleGoogleCheckbox) toggleGoogleCheckbox.checked = currentGoogleLoginState;
    if (statusGoogleBadge) {
      if (currentGoogleLoginState) {
        statusGoogleBadge.textContent = "Active";
        statusGoogleBadge.style.background = "#e8f5e9";
        statusGoogleBadge.style.color = "#1b5e20";
      } else {
        statusGoogleBadge.textContent = "Disabled";
        statusGoogleBadge.style.background = "#ffebee";
        statusGoogleBadge.style.color = "#c62828";
      }
    }
    if (stateGoogleLabel) {
      stateGoogleLabel.innerHTML = `Status: Google Login is currently <strong>${currentGoogleLoginState ? "Enabled" : "Disabled"}</strong>`;
    }
    if (toggleGoogleActionBtn) {
      toggleGoogleActionBtn.textContent = currentGoogleLoginState ? "Disable" : "Enable";
      toggleGoogleActionBtn.className = currentGoogleLoginState ? "button button-sm button-danger" : "button button-sm button-primary";
    }
  }

  function updateFacebookLoginUI(isEnabled) {
    currentFacebookLoginState = Boolean(isEnabled);
    if (toggleFacebookCheckbox) toggleFacebookCheckbox.checked = currentFacebookLoginState;
    if (statusFacebookBadge) {
      if (currentFacebookLoginState) {
        statusFacebookBadge.textContent = "Active";
        statusFacebookBadge.style.background = "#e8f5e9";
        statusFacebookBadge.style.color = "#1b5e20";
      } else {
        statusFacebookBadge.textContent = "Disabled";
        statusFacebookBadge.style.background = "#ffebee";
        statusFacebookBadge.style.color = "#c62828";
      }
    }
    if (stateFacebookLabel) {
      stateFacebookLabel.innerHTML = `Status: Facebook Login is currently <strong>${currentFacebookLoginState ? "Enabled" : "Disabled"}</strong>`;
    }
    if (toggleFacebookActionBtn) {
      toggleFacebookActionBtn.textContent = currentFacebookLoginState ? "Disable" : "Enable";
      toggleFacebookActionBtn.className = currentFacebookLoginState ? "button button-sm button-danger" : "button button-sm button-primary";
    }
  }

  async function loadAdminSettings() {
    try {
      const { ok, data } = await api("/admin/settings");
      if (ok) {
        if (typeof data.googleLoginEnabled === "boolean") updateGoogleLoginUI(data.googleLoginEnabled);
        if (typeof data.facebookLoginEnabled === "boolean") updateFacebookLoginUI(data.facebookLoginEnabled);
      }
      const adminEmail = getSignedInEmail() || "admin@minders.test";
      if (adminEmail) {
        const pinRes = await api(`/admin/pin-status?email=${encodeURIComponent(adminEmail)}`);
        const pinBadge = document.querySelector("#admin-pin-settings-badge");
        if (pinBadge) {
          if (pinRes.ok && pinRes.data?.hasPin) {
            pinBadge.textContent = "Configured";
            pinBadge.style.background = "#e8f5e9";
            pinBadge.style.color = "#1b5e20";
          } else {
            pinBadge.textContent = "Not Set";
            pinBadge.style.background = "#fffbeb";
            pinBadge.style.color = "#b45309";
          }
        }
      }
    } catch (e) {
      console.warn("Could not load settings:", e);
    }
  }

  async function saveGoogleLoginSetting(targetState) {
    if (feedbackEl) {
      feedbackEl.style.display = "block";
      feedbackEl.style.color = "#4b5563";
      feedbackEl.textContent = "Saving setting...";
    }
    try {
      const { ok, data } = await api("/admin/settings/google-login", {
        method: "POST",
        body: { enabled: targetState }
      });
      if (ok) {
        updateGoogleLoginUI(data.googleLoginEnabled);
        if (feedbackEl) {
          feedbackEl.style.color = "#15803d";
          feedbackEl.textContent = `Saved: Log in with Google has been ${data.googleLoginEnabled ? "enabled" : "disabled"}.`;
          setTimeout(() => { if (feedbackEl) feedbackEl.style.display = "none"; }, 4000);
        }
      } else {
        if (feedbackEl) {
          feedbackEl.style.color = "#b91c1c";
          feedbackEl.textContent = data.error || "Failed to update setting.";
        }
      }
    } catch (e) {
      if (feedbackEl) {
        feedbackEl.style.color = "#b91c1c";
        feedbackEl.textContent = "Network error while saving setting.";
      }
    }
  }

  async function saveFacebookLoginSetting(targetState) {
    if (feedbackEl) {
      feedbackEl.style.display = "block";
      feedbackEl.style.color = "#4b5563";
      feedbackEl.textContent = "Saving setting...";
    }
    try {
      const { ok, data } = await api("/admin/settings/facebook-login", {
        method: "POST",
        body: { enabled: targetState }
      });
      if (ok) {
        updateFacebookLoginUI(data.facebookLoginEnabled);
        if (feedbackEl) {
          feedbackEl.style.color = "#15803d";
          feedbackEl.textContent = `Saved: Log in with Facebook has been ${data.facebookLoginEnabled ? "enabled" : "disabled"}.`;
          setTimeout(() => { if (feedbackEl) feedbackEl.style.display = "none"; }, 4000);
        }
      } else {
        if (feedbackEl) {
          feedbackEl.style.color = "#b91c1c";
          feedbackEl.textContent = data.error || "Failed to update setting.";
        }
      }
    } catch (e) {
      if (feedbackEl) {
        feedbackEl.style.color = "#b91c1c";
        feedbackEl.textContent = "Network error while saving setting.";
      }
    }
  }

  toggleGoogleCheckbox?.addEventListener("change", () => {
    saveGoogleLoginSetting(toggleGoogleCheckbox.checked);
  });

  toggleGoogleActionBtn?.addEventListener("click", () => {
    saveGoogleLoginSetting(!currentGoogleLoginState);
  });

  toggleFacebookCheckbox?.addEventListener("change", () => {
    saveFacebookLoginSetting(toggleFacebookCheckbox.checked);
  });

  toggleFacebookActionBtn?.addEventListener("click", () => {
    saveFacebookLoginSetting(!currentFacebookLoginState);
  });

  openButtons.forEach((btn) => {
    btn?.addEventListener("click", (e) => {
      e.preventDefault();
      loadAdminSettings();
      dialog?.showModal();
    });
  });

  document.querySelector("#close-sys-config")?.addEventListener("click", () => dialog?.close());
  document.querySelector("#close-sys-config-btn")?.addEventListener("click", () => dialog?.close());
  dialog?.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  const changePinFormInSettings = document.querySelector("#settings-change-pin-form");
  changePinFormInSettings?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const adminEmail = getSignedInEmail() || "admin@minders.test";
    const currentPin = document.querySelector("#settings-current-pin")?.value.trim();
    const newPin = document.querySelector("#settings-new-pin")?.value.trim();
    const confirmPin = document.querySelector("#settings-confirm-pin")?.value.trim();
    const pinFeedback = document.querySelector("#settings-pin-feedback");

    if (!currentPin || !newPin || !confirmPin) {
      if (pinFeedback) {
        pinFeedback.style.display = "block";
        pinFeedback.style.color = "#b91c1c";
        pinFeedback.textContent = "Please fill in all PIN fields.";
      }
      return;
    }

    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      if (pinFeedback) {
        pinFeedback.style.display = "block";
        pinFeedback.style.color = "#b91c1c";
        pinFeedback.textContent = "New PIN must be exactly 6 digits.";
      }
      return;
    }

    if (newPin !== confirmPin) {
      if (pinFeedback) {
        pinFeedback.style.display = "block";
        pinFeedback.style.color = "#b91c1c";
        pinFeedback.textContent = "New PIN confirmation does not match.";
      }
      return;
    }

    if (newPin === currentPin) {
      if (pinFeedback) {
        pinFeedback.style.display = "block";
        pinFeedback.style.color = "#b91c1c";
        pinFeedback.textContent = "New PIN must be different from current PIN.";
      }
      return;
    }

    if (pinFeedback) {
      pinFeedback.style.display = "block";
      pinFeedback.style.color = "#15803d";
      pinFeedback.textContent = "Verifying current PIN and updating...";
    }

    const { ok, data } = await api("/admin/change-pin", {
      method: "POST",
      body: { email: adminEmail, currentPin, newPin, confirmPin }
    });

    if (!ok) {
      if (pinFeedback) {
        pinFeedback.style.display = "block";
        pinFeedback.style.color = "#b91c1c";
        pinFeedback.textContent = data.error || "Could not update PIN.";
      }
      return;
    }

    if (pinFeedback) {
      pinFeedback.style.display = "block";
      pinFeedback.style.color = "#15803d";
      pinFeedback.textContent = "✓ PIN updated successfully!";
      changePinFormInSettings.reset();
      const pinBadge = document.querySelector("#admin-pin-settings-badge");
      if (pinBadge) {
        pinBadge.textContent = "Configured";
        pinBadge.style.background = "#e8f5e9";
        pinBadge.style.color = "#1b5e20";
      }
      setTimeout(() => { if (pinFeedback) pinFeedback.style.display = "none"; }, 5000);
    }
  });

  if (window.location.hash === "#settings" || window.location.hash === "#config") {
    loadAdminSettings();
    dialog?.showModal();
  }

  // Globally initialize Admin 6-Digit PIN lifecycle & handlers for all admin pages
  initAdminPinLifecycle();
}

// Global Admin 6-Digit Security PIN Lifecycle (Applies across all admin pages)
function initAdminPinLifecycle() {
  const adminPinDialog = document.querySelector("#admin-pin-dialog");
  const setInitialPinForm = document.querySelector("#admin-set-initial-pin-form");
  const changePinForm = document.querySelector("#admin-change-pin-form");
  const pinNotice = document.querySelector("#pin-change-notice");
  const pinModalTitle = document.querySelector("#admin-pin-modal-title");
  const pinModalDesc = document.querySelector("#admin-pin-modal-desc");
  const closePinModalBtn = document.querySelector("#close-admin-pin-dialog");

  if (!adminPinDialog) return;

  async function checkAdminPinRequirement() {
    const adminEmail = getSignedInEmail() || "admin@minders.test";
    if (!adminEmail) return;
    const { ok, data } = await api(`/admin/pin-status?email=${encodeURIComponent(adminEmail)}`);
    if (!ok) return;

    if (data.mustChangePin) {
      if (setInitialPinForm) setInitialPinForm.style.display = "none";
      if (changePinForm) changePinForm.style.display = "block";
      if (pinNotice) pinNotice.style.display = "block";
      if (pinModalTitle) pinModalTitle.textContent = "One-Time Admin PIN Verification";
      if (pinModalDesc) pinModalDesc.textContent = "Please enter the temporary PIN provided by the administrator who created this account, then set and confirm your own permanent 6-digit PIN.";
      if (closePinModalBtn) closePinModalBtn.style.display = "none";
      adminPinDialog.showModal();
    } else if (!data.hasPin) {
      if (changePinForm) changePinForm.style.display = "none";
      if (setInitialPinForm) setInitialPinForm.style.display = "block";
      if (pinNotice) pinNotice.style.display = "none";
      if (pinModalTitle) pinModalTitle.textContent = "Create 6-Digit Admin Security PIN";
      if (pinModalDesc) pinModalDesc.textContent = "Welcome Admin! Please set up your 6-digit administrative action PIN. You will use this PIN to authorize sensitive operations like deleting accounts.";
      if (closePinModalBtn) closePinModalBtn.style.display = "none";
      adminPinDialog.showModal();
    }
  }

  // Check requirements on initialization
  checkAdminPinRequirement();

  // Handler to open and manage Security PIN dialog
  const handleOpenPinModal = async () => {
    const adminEmail = getSignedInEmail() || "admin@minders.test";
    if (closePinModalBtn) closePinModalBtn.style.display = "block";
    const { ok, data } = await api(`/admin/pin-status?email=${encodeURIComponent(adminEmail)}`);
    if (ok && data.hasPin && !data.mustChangePin) {
      if (setInitialPinForm) setInitialPinForm.style.display = "none";
      if (changePinForm) changePinForm.style.display = "block";
      if (pinNotice) pinNotice.style.display = "none";
      if (pinModalTitle) pinModalTitle.textContent = "Change Admin Security PIN";
      if (pinModalDesc) pinModalDesc.textContent = "Enter your current 6-digit PIN, then choose and confirm your new 6-digit PIN.";
    } else {
      if (changePinForm) changePinForm.style.display = "none";
      if (setInitialPinForm) setInitialPinForm.style.display = "block";
      if (pinNotice) pinNotice.style.display = "none";
      if (pinModalTitle) pinModalTitle.textContent = "Create 6-Digit Admin Security PIN";
      if (pinModalDesc) pinModalDesc.textContent = "Welcome Admin! Please set up your 6-digit administrative action PIN.";
    }
    setFeedback(document.querySelector("#initial-pin-feedback"), "");
    setFeedback(document.querySelector("#change-pin-feedback"), "");
    adminPinDialog?.showModal();
  };
  window.openAdminPinModal = handleOpenPinModal;

  document.querySelectorAll("#btn-open-pin-settings, [data-open-pin-modal]").forEach((btn) => {
    btn.onclick = handleOpenPinModal;
  });

  if (closePinModalBtn) {
    closePinModalBtn.onclick = () => adminPinDialog.close();
  }

  if (setInitialPinForm) {
    setInitialPinForm.onsubmit = async (e) => {
      e.preventDefault();
      const adminEmail = getSignedInEmail() || "admin@minders.test";
      const newPin = document.querySelector("#initial-new-pin")?.value.trim();
      const confirmPin = document.querySelector("#initial-confirm-pin")?.value.trim();
      const initialFeedback = document.querySelector("#initial-pin-feedback");

      if (!newPin || !confirmPin) return;
      if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
        setFeedback(initialFeedback, "PIN must be exactly 6 digits.", true);
        return;
      }
      if (newPin !== confirmPin) {
        setFeedback(initialFeedback, "Confirmation PIN does not match.", true);
        return;
      }

      setFeedback(initialFeedback, "Saving Security PIN...");
      const res = await api("/admin/set-initial-pin", {
        method: "POST",
        body: { email: adminEmail, newPin, confirmPin }
      });

      if (!res.ok) {
        setFeedback(initialFeedback, res.data.error || "Could not set PIN.", true);
        return;
      }

      adminPinDialog.close();
      alert("6-Digit Admin Security PIN has been set successfully! You will use this PIN when performing sensitive operations like deleting accounts.");
    };
  }

  if (changePinForm) {
    changePinForm.onsubmit = async (e) => {
      e.preventDefault();
      const adminEmail = getSignedInEmail() || "admin@minders.test";
      const currentPin = document.querySelector("#current-admin-pin")?.value.trim();
      const newPin = document.querySelector("#change-new-pin")?.value.trim();
      const confirmPin = document.querySelector("#change-confirm-pin")?.value.trim();
      const changeFeedback = document.querySelector("#change-pin-feedback");

      if (!currentPin || !newPin || !confirmPin) return;
      if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
        setFeedback(changeFeedback, "New PIN must be exactly 6 digits.", true);
        return;
      }
      if (newPin !== confirmPin) {
        setFeedback(changeFeedback, "New PIN confirmation does not match.", true);
        return;
      }
      if (newPin === currentPin) {
        setFeedback(changeFeedback, "New PIN must be different from current PIN.", true);
        return;
      }

      setFeedback(changeFeedback, "Updating Security PIN...");
      const res = await api("/admin/change-pin", {
        method: "POST",
        body: { email: adminEmail, currentPin, newPin, confirmPin }
      });

      if (!res.ok) {
        setFeedback(changeFeedback, res.data.error || "Could not update PIN.", true);
        return;
      }

      adminPinDialog.close();
      alert("Admin Security PIN updated successfully!");
    };
  }
}


// Audit log badge and action formatters
function getAuditBadgeClass(action) {
  const act = String(action || "").toUpperCase();
  if (act.includes("DELETED") || act.includes("SUSPENDED")) return "audit-badge-delete";
  if (act.includes("ARCHIVED")) return "audit-badge-security";
  if (act.includes("ACTIVATED") || act.includes("RESTORED")) return "audit-badge-auth";
  if (act.includes("UPDATED")) return "audit-badge-update";
  if (act.includes("CREATED") || act.includes("REGISTERED")) return "audit-badge-create";
  if (act.includes("LOGIN") || act.includes("VERIFIED")) return "audit-badge-auth";
  if (act.includes("OTP") || act.includes("AUTH") || act.includes("PASSWORD")) return "audit-badge-security";
  return "audit-badge-other";
}

function formatAuditAction(action) {
  return String(action || "").replace(/_/g, " ");
}

// Account management (admin only): list, create, edit, and multi-factor delete accounts stored in MongoDB.
function initAccountManagementPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true" || sessionStorage.getItem("minders-account-role") !== "admin") {
    window.location.replace("login.html");
    return;
  }
  syncAdminSidebarUser();
  const accountForm = document.querySelector("#staff-account-form");
  const accountList = document.querySelector("#account-list");
  const feedback = document.querySelector("#account-feedback");
  const pageFeedback = document.querySelector("#page-account-feedback");
  const createStaffDialog = document.querySelector("#create-staff-dialog");
  const btnOpenCreateStaff = document.querySelector("#btn-open-create-staff");
  const closeCreateStaffBtn = document.querySelector("#close-create-staff-dialog");
  const cancelCreateStaffBtn = document.querySelector("#cancel-create-staff-dialog");

  btnOpenCreateStaff?.addEventListener("click", () => {
    accountForm?.reset();
    setFeedback(feedback, "");
    createStaffDialog?.showModal();
  });

  closeCreateStaffBtn?.addEventListener("click", () => createStaffDialog?.close());
  cancelCreateStaffBtn?.addEventListener("click", () => createStaffDialog?.close());

  const staffRoleSelect = document.querySelector("#staff-role");
  const staffAdminPinGroup = document.querySelector("#staff-admin-pin-group");
  staffRoleSelect?.addEventListener("change", () => {
    if (staffAdminPinGroup) {
      staffAdminPinGroup.style.display = staffRoleSelect.value === "admin" ? "block" : "none";
    }
  });

  let allLoadedAccounts = [];
  let currentTab = "active"; // "active" | "archived"

  const tabBtnActive = document.querySelector("#tab-btn-active");
  const tabBtnArchive = document.querySelector("#tab-btn-archive");
  const archiveFolderBadge = document.querySelector("#archive-folder-badge");

  function setDirectoryTab(tab) {
    currentTab = tab;
    if (tab === "active") {
      if (tabBtnActive) {
        tabBtnActive.style.background = "#ffffff";
        tabBtnActive.style.borderColor = "var(--line)";
        tabBtnActive.style.color = "var(--ink)";
      }
      if (tabBtnArchive) {
        tabBtnArchive.style.background = "transparent";
        tabBtnArchive.style.borderColor = "transparent";
        tabBtnArchive.style.color = "var(--ink-soft)";
      }
      if (archiveFolderBadge) archiveFolderBadge.style.display = "none";
    } else {
      if (tabBtnArchive) {
        tabBtnArchive.style.background = "#fffbeb";
        tabBtnArchive.style.borderColor = "#fde68a";
        tabBtnArchive.style.color = "#92400e";
      }
      if (tabBtnActive) {
        tabBtnActive.style.background = "transparent";
        tabBtnActive.style.borderColor = "transparent";
        tabBtnActive.style.color = "var(--ink-soft)";
      }
      if (archiveFolderBadge) archiveFolderBadge.style.display = "inline-block";
    }
    renderAccounts();
  }

  tabBtnActive?.addEventListener("click", () => setDirectoryTab("active"));
  tabBtnArchive?.addEventListener("click", () => setDirectoryTab("archived"));

  const searchInput = document.querySelector("#account-search-input");
  const btnToggleFilter = document.querySelector("#btn-toggle-filter-popover");
  const filterPanel = document.querySelector("#filter-sort-panel");
  const sortSelect = document.querySelector("#filter-sort-select");
  const roleFilterSelect = document.querySelector("#filter-role-select");
  const statusFilterSelect = document.querySelector("#filter-status-select");
  const btnResetFilters = document.querySelector("#btn-reset-filters");
  const btnCloseFilter = document.querySelector("#btn-close-filter-popover");
  const activeFilterIndicator = document.querySelector("#active-filter-indicator");

  // Toggle filter popover panel
  btnToggleFilter?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!filterPanel) return;
    const isVisible = filterPanel.style.display === "block";
    filterPanel.style.display = isVisible ? "none" : "block";
  });

  btnCloseFilter?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (filterPanel) filterPanel.style.display = "none";
  });

  filterPanel?.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", (e) => {
    if (filterPanel && filterPanel.style.display === "block" && !filterPanel.contains(e.target) && e.target !== btnToggleFilter) {
      filterPanel.style.display = "none";
    }
  });

  function resetAllFilters() {
    if (searchInput) searchInput.value = "";
    if (sortSelect) sortSelect.value = "name_asc";
    if (roleFilterSelect) roleFilterSelect.value = "ALL";
    if (statusFilterSelect) statusFilterSelect.value = "ALL";
    renderAccounts();
  }
  btnResetFilters?.addEventListener("click", resetAllFilters);

  searchInput?.addEventListener("input", () => renderAccounts());
  sortSelect?.addEventListener("change", () => renderAccounts());
  roleFilterSelect?.addEventListener("change", () => renderAccounts());
  statusFilterSelect?.addEventListener("change", () => renderAccounts());

  function getRolePriority(role) {
    if (role === "admin") return 1;
    if (role === "manager") return 2;
    return 3; // member / other
  }

  const renderAccounts = async () => {
    const { ok, data } = await api("/accounts");
    allLoadedAccounts = ok && Array.isArray(data) ? data : [];

    const activeList = allLoadedAccounts.filter((a) => !a.isArchived);
    const archivedList = allLoadedAccounts.filter((a) => a.isArchived);
    const badgeActive = document.querySelector("#badge-count-active");
    const badgeArchived = document.querySelector("#badge-count-archived");
    if (badgeActive) badgeActive.textContent = activeList.length;
    if (badgeArchived) badgeArchived.textContent = archivedList.length;

    // Base list according to active vs archive folder tab
    let displayList = currentTab === "active" ? [...activeList] : [...archivedList];

    const query = (searchInput?.value || "").toLowerCase().trim();
    const sortMode = sortSelect?.value || "name_asc";
    const roleFilter = roleFilterSelect?.value || "ALL";
    const statusFilter = statusFilterSelect?.value || "ALL";

    // Active filter indicator state
    const isFiltered = Boolean(query || roleFilter !== "ALL" || statusFilter !== "ALL" || sortMode !== "name_asc");
    if (activeFilterIndicator) {
      activeFilterIndicator.style.display = isFiltered ? "inline-block" : "none";
    }
    if (btnToggleFilter) {
      btnToggleFilter.style.borderColor = isFiltered ? "#0d9488" : "#cbd5e1";
      btnToggleFilter.style.color = isFiltered ? "#0d9488" : "var(--ink)";
      btnToggleFilter.style.background = isFiltered ? "#f0fdfa" : "#f8fafc";
    }

    // 1. Filter by Search Query (Name, Email, Role, ID)
    if (query) {
      displayList = displayList.filter((acc) => {
        const name = (acc.fullName || "").toLowerCase();
        const email = (acc.email || "").toLowerCase();
        const role = (acc.role || "").toLowerCase();
        const id = (acc.cooperativeId || "").toLowerCase();
        return name.includes(query) || email.includes(query) || role.includes(query) || id.includes(query);
      });
    }

    // 2. Filter by Role
    if (roleFilter !== "ALL") {
      displayList = displayList.filter((acc) => acc.role === roleFilter);
    }

    // 3. Filter by Status
    if (statusFilter === "verified") {
      displayList = displayList.filter((acc) => acc.emailVerified && !acc.isSuspended);
    } else if (statusFilter === "unverified") {
      displayList = displayList.filter((acc) => !acc.emailVerified && !acc.isSuspended);
    } else if (statusFilter === "suspended") {
      displayList = displayList.filter((acc) => acc.isSuspended);
    }

    // 4. SORT: ADMIN AND MANAGER MUST ALWAYS BE ON THE TOP
    displayList.sort((a, b) => {
      const priorityA = getRolePriority(a.role);
      const priorityB = getRolePriority(b.role);
      if (priorityA !== priorityB) {
        return priorityA - priorityB; // Admin (1) first, Manager (2) second, Member (3) last
      }

      // Secondary sorting within the same role tier
      if (sortMode === "name_asc") {
        return (a.fullName || a.email).localeCompare(b.fullName || b.email);
      }
      if (sortMode === "name_desc") {
        return (b.fullName || b.email).localeCompare(a.fullName || a.email);
      }
      if (sortMode === "date_desc") {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (sortMode === "date_asc") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (sortMode === "email_asc") {
        return a.email.localeCompare(b.email);
      }
      return 0;
    });

    accountList.replaceChildren();
    displayList.forEach((account) => {
      const row = document.createElement("tr");

      // Column 1: Name
      const nameCell = document.createElement("td");
      const name = document.createElement("strong");
      name.textContent = account.fullName || "Unnamed account";
      nameCell.append(name);

      if (account.forgotPasswordRequested) {
        const resetBadge = document.createElement("span");
        resetBadge.className = "status-badge";
        resetBadge.style.cssText = "background: #fef3c7; color: #92400e; border: 1px solid #fde68a; margin-left: 6px; font-weight: 700; font-size: 0.68rem; vertical-align: middle;";
        resetBadge.textContent = "Reset Requested";
        resetBadge.title = "Member requested password recovery on login page";
        nameCell.append(resetBadge);
      }

      // Column 2: Member ID (Same plain style and color as email)
      const memberIdCell = document.createElement("td");
      memberIdCell.textContent = account.cooperativeId || "—";

      // Column 3: Email
      const emailCell = document.createElement("td");
      emailCell.textContent = account.email;

      // Column 4: Role (Same plain style and color as email)
      const roleCell = document.createElement("td");
      const roleName = ({ admin: "Admin", manager: "Manager" })[account.role] || "Member";
      roleCell.textContent = roleName;

      // (Status column deleted as requested)

      // Column 5: Created
      const createdCell = document.createElement("td");
      createdCell.textContent = account.createdAt ? new Date(account.createdAt).toLocaleDateString() : "-";

      // Column 6: Action
      const actionCell = document.createElement("td");
      actionCell.className = "align-right";
      const actionGroup = document.createElement("div");
      actionGroup.className = "action-group";

      if (currentTab === "active") {
        if (account.email !== getSignedInEmail()) {
          const viewDashboardBtn = document.createElement("button");
          viewDashboardBtn.className = "action-button impersonate-button icon-only-btn";
          viewDashboardBtn.title = `View ${account.fullName || account.email}'s ${account.role} dashboard`;
          viewDashboardBtn.setAttribute("aria-label", `View ${account.fullName || account.email}'s dashboard`);
          viewDashboardBtn.dataset.impersonateAccount = account.id || account.email;
          viewDashboardBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M1 12C2.8 7.5 7 4.5 12 4.5C17 4.5 21.2 7.5 23 12C21.2 16.5 17 19.5 12 19.5C7 19.5 2.8 16.5 1 12Z"></path>
              <circle cx="12" cy="12" r="4"></circle>
            </svg>
          `;
          actionGroup.append(viewDashboardBtn);
        }

        const editButton = document.createElement("button");
        editButton.className = "action-button approve-button";
        editButton.dataset.editAccount = account.email;
        editButton.textContent = "Edit";
        actionGroup.append(editButton);
      } else {
        const restoreButton = document.createElement("button");
        restoreButton.className = "action-button approve-button";
        restoreButton.dataset.restoreAccount = account.email;
        restoreButton.textContent = "Restore";
        restoreButton.title = "Restore account to active directory";

        const editButton = document.createElement("button");
        editButton.className = "action-button";
        editButton.style.background = "#f1f5f9";
        editButton.dataset.editAccount = account.email;
        editButton.textContent = "Edit";

        actionGroup.append(restoreButton, editButton);
      }

      actionCell.append(actionGroup);
      row.append(nameCell, memberIdCell, emailCell, roleCell, createdCell, actionCell);
      accountList.append(row);
    });

    if (!displayList.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "accounts-empty";
      cell.textContent = isFiltered
        ? "No accounts match the current search query or filter selection."
        : (currentTab === "archived"
          ? "The archive folder is empty. No accounts are archived."
          : (ok ? "No active accounts registered yet." : (data.error || "Could not load accounts.")));
      row.append(cell);
      accountList.append(row);
    }
  };

  // Edit Account Dialog Elements
  const editDialog = document.querySelector("#edit-account-dialog");
  const editForm = document.querySelector("#edit-account-form");
  const editFeedback = document.querySelector("#edit-feedback");
  const originalEmailInput = document.querySelector("#edit-original-email");
  const editFullNameInput = document.querySelector("#edit-full-name");
  const editEmailInput = document.querySelector("#edit-email");
  const editRoleInput = document.querySelector("#edit-role");
  const editOtpNoRequest = document.querySelector("#edit-otp-no-request");
  const editOtpHasRequest = document.querySelector("#edit-otp-has-request");
  const editOneTimePasswordInput = document.querySelector("#edit-one-time-password");
  const btnGenerateOtp = document.querySelector("#btn-generate-otp");

  btnGenerateOtp?.addEventListener("click", () => {
    if (editOneTimePasswordInput) {
      editOneTimePasswordInput.value = `KIMPC-${Math.floor(1000 + Math.random() * 9000)}`;
      editOneTimePasswordInput.focus();
    }
  });

  const closeEditDialog = () => {
    editForm?.reset();
    if (editOtpNoRequest) editOtpNoRequest.style.display = "flex";
    if (editOtpHasRequest) editOtpHasRequest.style.display = "none";
    if (editOneTimePasswordInput) editOneTimePasswordInput.value = "";
    setFeedback(editFeedback, "");
    editDialog?.close();
  };

  document.querySelector("#close-edit-dialog")?.addEventListener("click", closeEditDialog);
  document.querySelector("#cancel-edit-dialog")?.addEventListener("click", closeEditDialog);
  editDialog?.addEventListener("click", (e) => {
    if (e.target === editDialog) closeEditDialog();
  });

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editForm.checkValidity()) { editForm.reportValidity(); return; }
    const submitBtn = editForm.querySelector(".btn-modal-save");
    const originalHtml = submitBtn ? submitBtn.innerHTML : "Save Changes";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span style="display: inline-block; width: 14px; height: 14px; border: 2px solid #ffffff; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; margin-right: 6px; vertical-align: -2px;"></span> Saving...`;
    }
    const originalEmail = originalEmailInput.value;
    const payload = {
      fullName: editFullNameInput.value.trim(),
      email: editEmailInput.value.trim().toLowerCase(),
      role: editRoleInput.value,
      actorEmail: getSignedInEmail() || "admin@minders.test"
    };

    // Administrators cannot arbitrarily change passwords.
    // An admin can ONLY issue a temporary One-Time Password if the member requested it from the login page.
    if (currentEditingAccount?.forgotPasswordRequested) {
      const otpVal = editOneTimePasswordInput ? editOneTimePasswordInput.value.trim() : "";
      if (otpVal) {
        if (otpVal.length < 6) {
          setFeedback(editFeedback, "One-Time Password must be at least 6 characters.", true);
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalHtml; }
          return;
        }
        payload.isForgotPassword = true;
        payload.oneTimePassword = otpVal;
      }
    }
    const adminPinVal = document.querySelector("#edit-admin-pin")?.value.trim();
    if (adminPinVal && (payload.role === "admin" || originalEmail === getSignedInEmail())) {
      if (adminPinVal.length !== 6 || !/^\d{6}$/.test(adminPinVal)) {
        setFeedback(editFeedback, "Admin Security PIN must be exactly 6 digits.", true);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalHtml; }
        return;
      }
      payload.adminPin = adminPinVal;
    }
    const { ok, data } = await api(accountPath(originalEmail), {
      method: "PATCH",
      body: payload
    });
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
    if (!ok) {
      setFeedback(editFeedback, data.error || "Could not update account.", true);
      return;
    }
    // If the currently signed-in admin edited their own account
    if (originalEmail === getSignedInEmail()) {
      sessionStorage.setItem("minders-member-email", data.email);
      sessionStorage.setItem("minders-account-role", data.role);
      sessionStorage.setItem("minders-account-name", data.fullName || "");
      await syncAdminSidebarUser();
    }
    editDialog?.close();
    setFeedback(pageFeedback || feedback, `Account for ${data.email} updated successfully.`);
    await renderAccounts();
  });

  accountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!accountForm.checkValidity()) { accountForm.reportValidity(); return; }
    const formData = new FormData(accountForm);
    const role = formData.get("role");
    const payload = {
      fullName: String(formData.get("fullName")).trim(),
      email: String(formData.get("email")).trim().toLowerCase(),
      password: formData.get("password"),
      role,
      actorEmail: getSignedInEmail() || "admin@minders.test"
    };

    if (role === "admin") {
      const pin = formData.get("adminPin");
      if (pin) payload.adminPin = String(pin).trim();
    }

    const { ok, data } = await api("/accounts", {
      method: "POST",
      body: payload
    });
    if (!ok) {
      setFeedback(feedback, data.error || "Could not create the account.", true);
      return;
    }
    accountForm.reset();
    createStaffDialog?.close();
    if (staffAdminPinGroup) staffAdminPinGroup.style.display = "none";

    if (data.oneTimePin) {
      alert(`Admin Account Created Successfully!\n\nNew Admin: ${data.fullName || data.email}\nOne-Time Setup PIN: ${data.oneTimePin}\n\nPlease copy this one-time PIN and provide it to the new administrator. They will be required to enter it and set their own permanent 6-digit PIN on their first login.`);
    }

    setFeedback(pageFeedback || feedback, `Staff account created and added to directory for ${data.fullName || data.email} (${data.role}).`);
    renderAccounts();
  });

  // =========================================================================
  // MULTI-FACTOR DELETION VERIFICATION WIZARD
  // Sequence requested:
  // 1. Initial Prompt: Ask if it will be deleted
  // 2. Step 2: Ask the password of the admin
  // 3. Step 3: Ask OTP sent to admin email
  // 4. Step 4: Ask again if it will be deleted showing Account NAME and ROLE
  // 5. Final Step: Completely deleted before finishing
  // =========================================================================
  // MULTI-STEP ACCOUNT DELETION WORKFLOW (Password-Verified)
  // 1. Step 1: Initial Prompt - Ask if account will be deleted
  // 2. Step 2: Administrator Authentication - Enter Admin Password
  // 3. Step 3: Final Confirmation - Display Name, Role, & Email before permanently deleting
  // =========================================================================
  const deleteFlowDialog = document.querySelector("#delete-flow-dialog");
  const delStep1 = document.querySelector("#delete-step-1");
  const delStep2 = document.querySelector("#delete-step-2");
  const delStep3 = document.querySelector("#delete-step-3");

  let currentTarget = null; // { email, fullName, role }
  let currentDeleteToken = null;

  function showDeleteStep(stepNum) {
    if (delStep1) delStep1.style.display = stepNum === 1 ? "block" : "none";
    if (delStep2) delStep2.style.display = stepNum === 2 ? "block" : "none";
    if (delStep3) delStep3.style.display = stepNum === 3 ? "block" : "none";
  }

  function startDeleteFlow(target) {
    const adminEmail = getSignedInEmail() || "admin@minders.test";
    if (target.email === adminEmail) {
      setFeedback(feedback, "You cannot delete the account you are currently logged in with.", true);
      return;
    }

    currentTarget = target;
    currentDeleteToken = null;

    // Step 1 Population
    const s1Name = document.querySelector("#del-step1-name");
    const s1Email = document.querySelector("#del-step1-email");
    const s1Role = document.querySelector("#del-step1-role");
    if (s1Name) s1Name.textContent = target.fullName || target.email;
    if (s1Email) s1Email.textContent = target.email;
    if (s1Role) s1Role.textContent = target.role || "Member";

    // Reset inputs & feedback
    const pwdInput = document.querySelector("#del-admin-password");
    if (pwdInput) pwdInput.value = "";
    setFeedback(document.querySelector("#del-step2-feedback"), "");
    setFeedback(document.querySelector("#del-step3-feedback"), "");

    const s2Admin = document.querySelector("#del-step2-admin-email");
    if (s2Admin) s2Admin.textContent = adminEmail;

    showDeleteStep(1);
    deleteFlowDialog?.showModal();
  }

  // Close buttons on deletion modal
  document.querySelectorAll("[data-close-delete-flow]").forEach((btn) => {
    btn.addEventListener("click", () => deleteFlowDialog?.close());
  });

  // Step 1: User confirms "Yes, Delete" -> Advance to Step 2 (Ask Admin Password)
  document.querySelector("#btn-del-proceed-step2")?.addEventListener("click", () => {
    showDeleteStep(2);
    document.querySelector("#del-admin-password")?.focus();
  });

  // Step 2: Back button to Step 1
  document.querySelector("#btn-del-back-step1")?.addEventListener("click", () => {
    showDeleteStep(1);
  });

  // Step 2 Form Submission: Verify Admin Password & Advance directly to Step 3 Final Confirmation
  const delPasswordForm = document.querySelector("#del-password-form");
  delPasswordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const adminEmail = getSignedInEmail() || "admin@minders.test";
    const pwdInput = document.querySelector("#del-admin-password");
    const step2Feedback = document.querySelector("#del-step2-feedback");
    const password = pwdInput ? pwdInput.value : "";
    if (!password) return;

    setFeedback(step2Feedback, "Verifying 6-digit security PIN...");
    const verifyRes = await api("/admin/verify-pin", {
      method: "POST",
      body: { adminEmail, targetEmail: currentTarget.email, pin: password }
    });

    if (!verifyRes.ok) {
      setFeedback(step2Feedback, verifyRes.data.error || "Incorrect 6-digit admin PIN.", true);
      return;
    }

    currentDeleteToken = verifyRes.data.deleteToken;
    if (verifyRes.data.target) {
      currentTarget = verifyRes.data.target;
    }

    // Step 3 Population: Display Target Account Full Name and Role
    const finalName = document.querySelector("#del-final-name");
    const finalRole = document.querySelector("#del-final-role");
    const finalEmail = document.querySelector("#del-final-email");
    if (finalName) finalName.textContent = currentTarget.fullName || currentTarget.email;
    if (finalRole) finalRole.textContent = currentTarget.role || "Member";
    if (finalEmail) finalEmail.textContent = currentTarget.email;

    setFeedback(document.querySelector("#del-step3-feedback"), "");
    showDeleteStep(3);
  });

  // Step 3: Final Confirmation Click -> Completely Delete Account
  document.querySelector("#btn-del-final-execute")?.addEventListener("click", async () => {
    const adminEmail = getSignedInEmail() || "admin@minders.test";
    const step3Feedback = document.querySelector("#del-step3-feedback");
    if (!currentDeleteToken || !currentTarget) {
      setFeedback(step3Feedback, "Verification session expired.", true);
      return;
    }

    setFeedback(step3Feedback, "Completely deleting account from MongoDB...");
    const delRes = await api(`/accounts/${encodeURIComponent(currentTarget.email)}`, {
      method: "DELETE",
      body: {
        deleteToken: currentDeleteToken,
        adminEmail
      }
    });

    if (!delRes.ok) {
      setFeedback(step3Feedback, delRes.data.error || "Could not delete account.", true);
      return;
    }

    deleteFlowDialog?.close();
    setFeedback(pageFeedback || feedback, `Account for ${currentTarget.fullName || currentTarget.email} (${currentTarget.email}) was completely deleted.`);
    renderAccounts();
  });

  // Admin Security PIN lifecycle is globally initialized via initAdminPinLifecycle()
  let currentEditingAccount = null;

  async function openEditDialog(email) {
    const { ok, data } = await api(accountPath(email));
    if (!ok) {
      setFeedback(pageFeedback || feedback, data.error || "Could not load account details.", true);
      return;
    }
    currentEditingAccount = data;
    originalEmailInput.value = data.email;
    editFullNameInput.value = data.fullName || "";
    editEmailInput.value = data.email || "";
    editRoleInput.value = data.role || "member";

    const forgotRequested = Boolean(data.forgotPasswordRequested);
    if (editOtpNoRequest) editOtpNoRequest.style.display = forgotRequested ? "none" : "flex";
    if (editOtpHasRequest) editOtpHasRequest.style.display = forgotRequested ? "block" : "none";
    if (editOneTimePasswordInput) {
      editOneTimePasswordInput.value = forgotRequested ? `KIMPC-${Math.floor(1000 + Math.random() * 9000)}` : "";
    }
    setFeedback(editFeedback, "");

    const isSelf = data.email === getSignedInEmail();
    const editSubtitle = document.querySelector("#edit-account-subtitle");
    if (editSubtitle) {
      const idStr = data.cooperativeId ? ` • ID: ${data.cooperativeId}` : "";
      const roleStr = (data.role || "member").toUpperCase();
      editSubtitle.textContent = `${data.fullName || data.email} (${roleStr}${idStr})`;
    }

    const editSecuritySection = document.querySelector("#edit-security-section");
    const btnArchiveFromEdit = document.querySelector("#btn-archive-from-edit");
    const editArchiveDesc = document.querySelector("#edit-archive-desc");

    // Admin Security PIN settings inside Edit modal
    const editAdminPinField = document.querySelector("#edit-admin-pin-field");
    const editAdminPinInput = document.querySelector("#edit-admin-pin");
    const editAdminPinRow = document.querySelector("#edit-admin-pin-row");
    const editAdminPinDesc = document.querySelector("#edit-admin-pin-desc");
    const btnEditChangePin = document.querySelector("#btn-edit-change-pin");

    if (editAdminPinInput) editAdminPinInput.value = "";

    function syncEditAdminPinVisibility(role) {
      const isAdmin = role === "admin";
      if (editAdminPinField) editAdminPinField.style.display = isAdmin ? "flex" : "none";
      if (editSecuritySection) editSecuritySection.style.display = isAdmin ? "block" : "none";
      if (editAdminPinRow) editAdminPinRow.style.display = isAdmin ? "flex" : "none";
      if (isAdmin && editAdminPinDesc) {
        if (data.hasAdminPin) {
          editAdminPinDesc.textContent = "Configured • 6-digit Security PIN is active";
          if (btnEditChangePin) btnEditChangePin.textContent = "Change PIN";
        } else {
          editAdminPinDesc.textContent = "Not Set • Account has no Security PIN yet";
          if (btnEditChangePin) btnEditChangePin.textContent = "Set PIN";
        }
      }
    }

    syncEditAdminPinVisibility(data.role || "member");

    if (editRoleInput) {
      editRoleInput.onchange = () => {
        syncEditAdminPinVisibility(editRoleInput.value);
      };
    }

    if (btnEditChangePin) {
      btnEditChangePin.onclick = () => {
        if (typeof window.openAdminPinModal === "function") {
          window.openAdminPinModal();
        } else {
          document.querySelector("#admin-pin-dialog")?.showModal();
        }
      };
    }

    if (isSelf) {
      if (btnArchiveFromEdit) { btnArchiveFromEdit.disabled = true; btnArchiveFromEdit.style.opacity = "0.4"; }
      if (editArchiveDesc) editArchiveDesc.textContent = "Active Administrator Account (Self / Protected)";
    } else {
      if (btnArchiveFromEdit) { btnArchiveFromEdit.disabled = false; btnArchiveFromEdit.style.opacity = "1"; }
      if (data.isArchived) {
        if (editArchiveDesc) editArchiveDesc.textContent = "Account is archived. Preserved in archive folder.";
        if (btnArchiveFromEdit) {
          btnArchiveFromEdit.textContent = "Restore Account";
          btnArchiveFromEdit.className = "btn-control btn-control-teal";
          btnArchiveFromEdit.style.cssText = "";
        }
      } else {
        if (editArchiveDesc) editArchiveDesc.textContent = "Move to archive folder. Preserves records safely.";
        if (btnArchiveFromEdit) {
          btnArchiveFromEdit.textContent = "Move to Archive";
          btnArchiveFromEdit.className = "btn-control btn-control-archive";
          btnArchiveFromEdit.style.cssText = "";
        }
      }
    }

    editDialog?.showModal();
  }

  // Archive / Restore button inside Edit modal
  document.querySelector("#btn-archive-from-edit")?.addEventListener("click", async () => {
    if (!currentEditingAccount) return;
    const adminEmail = getSignedInEmail();
    if (currentEditingAccount.email === adminEmail) {
      setFeedback(editFeedback, "You cannot archive your own admin account.", true);
      return;
    }
    const shouldArchive = !currentEditingAccount.isArchived;

    setFeedback(editFeedback, shouldArchive ? "Moving account to archive folder..." : "Restoring account from archive...");
    const res = await api(`/accounts/${encodeURIComponent(currentEditingAccount.email)}/archive`, {
      method: "PATCH",
      body: {
        isArchived: shouldArchive,
        actorEmail: adminEmail
      }
    });

    if (!res.ok) {
      setFeedback(editFeedback, res.data.error || "Could not update archive status.", true);
      return;
    }

    editDialog?.close();
    setFeedback(pageFeedback || feedback, shouldArchive 
      ? `Account ${currentEditingAccount.email} moved to the Archive Folder.`
      : `Account ${currentEditingAccount.email} restored to Active Accounts.`
    );
    renderAccounts();
  });

  // Table row actions (Edit Account & Restore Account)
  accountList.addEventListener("click", async (event) => {
    // Restore button in Archive tab
    const restoreBtn = event.target.closest("[data-restore-account]");
    if (restoreBtn) {
      const email = restoreBtn.dataset.restoreAccount;
      const adminEmail = getSignedInEmail();
      const res = await api(`/accounts/${encodeURIComponent(email)}/archive`, {
        method: "PATCH",
        body: { isArchived: false, actorEmail: adminEmail }
      });
      if (res.ok) {
        setFeedback(pageFeedback || feedback, `Account ${email} restored to active directory.`);
        renderAccounts();
      } else {
        setFeedback(pageFeedback || feedback, res.data.error || "Could not restore account.", true);
      }
      return;
    }

    // Impersonate ("View Dashboard") button
    const impersonateBtn = event.target.closest("[data-impersonate-account]");
    if (impersonateBtn) {
      const targetUserId = impersonateBtn.dataset.impersonateAccount;
      await handleImpersonate(targetUserId);
      return;
    }

    // Edit button
    const editBtn = event.target.closest("[data-edit-account]");
    if (editBtn) {
      openEditDialog(editBtn.dataset.editAccount);
    }
  });

  renderAccounts();
}

/**
 * Handle Admin User Impersonation:
 * Saves the current Admin JWT token into localStorage (as adminToken),
 * calls POST /api/admin/impersonate/:userId to acquire the scoped user token,
 * updates session storage, and redirects the Admin to the target user's dashboard.
 */
async function handleImpersonate(userId) {
  try {
    const adminEmail = getSignedInEmail() || "admin@minders.test";
    const currentToken = localStorage.getItem("token") || sessionStorage.getItem("minders-jwt-token") || "admin-active-session";

    // 1. Save Admin's current JWT token to localStorage (as adminToken)
    localStorage.setItem("adminToken", currentToken);
    localStorage.setItem("adminOriginalEmail", adminEmail);
    localStorage.setItem("adminOriginalRole", "admin");

    // 2. Request user impersonation token from Express backend
    const res = await api(`/admin/impersonate/${encodeURIComponent(userId)}`, {
      method: "POST",
      body: { adminEmail }
    });

    if (!res.ok) {
      alert(res.data.error || "Impersonation failed. Ensure you have administrator permissions.");
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminOriginalEmail");
      localStorage.removeItem("adminOriginalRole");
      return;
    }

    const { token, user } = res.data;

    // 3. Replace the main token with the new user's token
    localStorage.setItem("token", token);
    sessionStorage.setItem("minders-jwt-token", token);
    sessionStorage.setItem("minders-member-auth", "true");
    sessionStorage.setItem("minders-member-email", user.email);
    sessionStorage.setItem("minders-account-role", user.role);
    sessionStorage.setItem("minders-account-name", user.fullName || user.email);
    sessionStorage.setItem("minders-is-impersonating", "true");

    // 4. Redirect Admin to target user's dashboard
    const destination = getDashboardForRole(user.role);
    window.location.href = destination;
  } catch (error) {
    console.error("Impersonation error:", error);
    alert("Could not start impersonation session.");
  }
}

/**
 * Floating "Return to Admin" UI widget:
 * Automatically renders a floating bar whenever an adminToken exists in localStorage.
 * When clicked, it restores the Admin's original session and returns to the admin portal.
 */
function initImpersonationBanner() {
  const adminToken = localStorage.getItem("adminToken");
  if (!adminToken) return;

  if (document.querySelector("#impersonation-return-banner")) return;

  const currentRole = sessionStorage.getItem("minders-account-role") || "user";
  const currentUser = sessionStorage.getItem("minders-account-name") || sessionStorage.getItem("minders-member-email") || "User";
  const roleName = ({ admin: "Admin", manager: "Manager", member: "Member" })[currentRole] || currentRole;

  const banner = document.createElement("aside");
  banner.id = "impersonation-return-banner";
  banner.className = "impersonation-floating-banner";
  banner.setAttribute("aria-label", "User Impersonation Active");
  banner.innerHTML = `
    <div class="impersonation-banner-content">
      <div class="impersonation-indicator" aria-hidden="true">
        <span class="impersonation-pulse"></span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 8 8 8 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </div>
      <div class="impersonation-text">
        <span class="impersonation-title">Troubleshooting Session Active</span>
        <span class="impersonation-subtitle">Viewing as <strong>${escapeHtml(currentUser)}</strong> (${escapeHtml(roleName)})</span>
      </div>
      <button type="button" id="btn-return-to-admin" class="impersonation-return-btn" title="Exit troubleshooting and restore original Admin session">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 14 4 9 9 4"></polyline>
          <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
        </svg>
        <span>Return to Admin</span>
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  document.querySelector("#btn-return-to-admin")?.addEventListener("click", async () => {
    const originalAdminEmail = localStorage.getItem("adminOriginalEmail") || "admin@minders.test";
    const currentImpersonatedEmail = sessionStorage.getItem("minders-member-email");
    const originalToken = localStorage.getItem("adminToken");

    try {
      await api("/admin/impersonate/end", {
        method: "POST",
        body: { adminEmail: originalAdminEmail, targetEmail: currentImpersonatedEmail }
      });
    } catch (e) {
      // Non-blocking log
    }

    // Restore Admin's original session tokens
    if (originalToken && originalToken !== "admin-active-session") {
      localStorage.setItem("token", originalToken);
      sessionStorage.setItem("minders-jwt-token", originalToken);
    } else {
      localStorage.removeItem("token");
      sessionStorage.removeItem("minders-jwt-token");
    }

    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminOriginalEmail");
    localStorage.removeItem("adminOriginalRole");
    sessionStorage.removeItem("minders-is-impersonating");

    sessionStorage.setItem("minders-member-auth", "true");
    sessionStorage.setItem("minders-account-role", "admin");
    sessionStorage.setItem("minders-member-email", originalAdminEmail);

    window.location.href = "account-management.html";
  });
}

// ─── Audit helpers ───────────────────────────────────────────────────────────

/**
 * Return a CSS class name for an audit action badge based on the action key.
 */
function getAuditBadgeClass(action) {
  if (!action) return "badge-default";
  if (action.includes("DELETED") || action.includes("PURGED")) return "badge-danger";
  if (action.includes("FAILED") || action.includes("REJECTED")) return "badge-failed";
  if (action.includes("DENIED") || action.includes("SUSPENDED")) return "badge-warning";
  if (action.includes("LOGIN") || action.includes("VERIFIED")) return "badge-info";
  if (action.includes("APPROVED") || action.includes("ACTIVATED") || action.includes("RESTORED")) return "badge-success";
  if (action.includes("UPDATED") || action.includes("CREATED") || action.includes("REGISTERED")) return "badge-blue";
  if (action.includes("BOOKING") || action.includes("APPLICATION")) return "badge-purple";
  if (action.includes("ARCHIVED")) return "badge-muted";
  return "badge-default";
}

/**
 * Convert a SCREAMING_SNAKE_CASE action key into a readable label.
 * Examples: "ACCOUNT_DELETED" → "Account Deleted"
 *           "BOOKING_APPROVED" → "Booking Approved"
 */
function formatAuditAction(action) {
  if (!action) return "-";
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Export an array of audit log objects to a downloadable JSON file.
 */
function exportAuditLogsJson(logs) {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export an array of audit log objects to a downloadable CSV file.
 */
function exportAuditLogsCsv(logs) {
  const headers = ["Timestamp", "Action", "Actor Email", "Actor Role", "Target Email", "Target Name", "Target Role", "Details", "Status", "IP"];
  const esc = (v) => { const s = String(v ?? "").replace(/"/g, '""'); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s; };
  const rows = logs.map((l) => [
    new Date(l.createdAt).toLocaleString(),
    l.action, l.actorEmail, l.actorRole,
    l.targetEmail || "", l.targetName || "", l.targetRole || "",
    typeof l.details === "object" ? JSON.stringify(l.details) : String(l.details || ""),
    l.status, l.ip || ""
  ].map(esc).join(","));
  const csv = [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Audit Logs Page ─────────────────────────────────────────────────────────

// Administrator Audit Logs page: live stream, search, filtering, export, and purging.
async function initAuditLogsPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true" || sessionStorage.getItem("minders-account-role") !== "admin") {
    window.location.replace("login.html");
    return;
  }
  syncAdminSidebarUser();

  const tableBody = document.querySelector("#audit-log-rows");
  const searchInput = document.querySelector("#audit-search");
  const actionFilter = document.querySelector("#audit-filter-action");
  const refreshBtn = document.querySelector("#refresh-audit-logs");
  const purgeBtn = document.querySelector("#btn-purge-logs");
  const exportJsonBtn = document.querySelector("#btn-export-json");
  const exportCsvBtn = document.querySelector("#btn-export-csv");
  const resultCount = document.querySelector("#audit-result-count");

  let allLogs = [];
  let lastStats = {};

  // ── render ──
  const renderLogs = () => {
    const searchTerm = (searchInput?.value || "").toLowerCase().trim();
    const actionVal = actionFilter?.value || "ALL";

    let filtered = allLogs;
    if (actionVal !== "ALL") {
      filtered = filtered.filter((log) => log.action === actionVal);
    }
    if (searchTerm) {
      filtered = filtered.filter((log) =>
        (log.actorEmail || "").toLowerCase().includes(searchTerm) ||
        (log.targetEmail || "").toLowerCase().includes(searchTerm) ||
        (log.targetName || "").toLowerCase().includes(searchTerm) ||
        (log.action || "").toLowerCase().includes(searchTerm) ||
        (typeof log.details === "object"
          ? JSON.stringify(log.details)
          : String(log.details || "")).toLowerCase().includes(searchTerm)
      );
    }

    // ── Summary stats (use server-side counts from ?stats=true for accuracy) ──
    const totalEl = document.querySelector("#audit-stat-total");
    const delEl = document.querySelector("#audit-stat-deletions");
    const updEl = document.querySelector("#audit-stat-updates");
    const logEl = document.querySelector("#audit-stat-logins");
    const bookEl = document.querySelector("#audit-stat-bookings");
    const badgeEl = document.querySelector("#sidebar-audit-badge");

    if (totalEl) totalEl.textContent = lastStats.total ?? allLogs.length;
    if (delEl) delEl.textContent = lastStats.deletions ?? allLogs.filter((l) => l.action.includes("DELETED")).length;
    if (updEl) updEl.textContent = lastStats.modifications ?? allLogs.filter((l) => l.action.includes("UPDATED")).length;
    if (logEl) logEl.textContent = lastStats.logins ?? allLogs.filter((l) => l.action.includes("LOGIN")).length;
    if (bookEl) bookEl.textContent = lastStats.bookings ?? allLogs.filter((l) => l.action.includes("BOOKING")).length;
    if (badgeEl) badgeEl.textContent = lastStats.total ?? allLogs.length;
    if (resultCount) resultCount.textContent = `${filtered.length} record${filtered.length !== 1 ? "s" : ""}`;

    if (!filtered.length) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--ink-soft);">No matching audit log entries found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map((log) => {
      const dateStr = new Date(log.createdAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const badgeClass = getAuditBadgeClass(log.action);
      const statusClass = log.status === "Success" ? "status-approved" : log.status === "Denied" ? "status-warning" : "status-rejected";

      const targetDisplay = log.targetName || log.targetEmail ? `
        <strong>${escapeHtml(log.targetName || "Target")}</strong>
        <small>${escapeHtml(log.targetEmail || "")} ${log.targetRole ? `(${escapeHtml(log.targetRole)})` : ""}</small>
      ` : `<span class="muted">-</span>`;

      // Render details — JSON objects get formatted as a small definition list.
      let detailsHtml;
      if (log.details && typeof log.details === "object") {
        const entries = Object.entries(log.details);
        detailsHtml = `<dl class="audit-details-dl">${entries.map(([k, v]) =>
          `<div><dt>${escapeHtml(k.replace(/([A-Z])/g, " $1").trim())}:</dt><dd>${escapeHtml(String(v))}</dd></div>`
        ).join("")}</dl>`;
      } else {
        detailsHtml = escapeHtml(String(log.details || "-"));
      }

      return `<tr>
        <td style="white-space: nowrap;">
          <strong>${dateStr.split(",")[0]}</strong>
          <small>${(dateStr.split(",")[1] || "").trim()}</small>
        </td>
        <td>
          <strong style="color: var(--ink);">${escapeHtml(formatAuditAction(log.action))}</strong>
        </td>
        <td>
          <strong>${escapeHtml(log.actorEmail || "system")}</strong>
          <small style="text-transform: capitalize;">${escapeHtml(log.actorRole || "admin")}</small>
        </td>
        <td>${targetDisplay}</td>
        <td class="audit-details-cell">${detailsHtml}</td>
        <td>
          <span class="status-badge ${statusClass}">${escapeHtml(log.status)}</span>
        </td>
      </tr>`;
    }).join("");
  };

  // ── fetch ──
  const fetchLogs = async () => {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--ink-soft);">Loading audit records from MongoDB...</td></tr>`;
    const { ok, data } = await api("/audit-logs?limit=200&stats=true");
    if (ok && data.logs) {
      allLogs = data.logs;
      lastStats = data.stats || {};
    } else if (ok && Array.isArray(data)) {
      // Fallback for old API shape
      allLogs = data;
      lastStats = {};
    } else {
      allLogs = [];
      lastStats = {};
    }
    renderLogs();
  };

  // ── event listeners ──
  searchInput?.addEventListener("input", renderLogs);
  actionFilter?.addEventListener("change", renderLogs);
  refreshBtn?.addEventListener("click", fetchLogs);

  exportJsonBtn?.addEventListener("click", () => {
    const filtered = getFilteredLogs();
    exportAuditLogsJson(filtered);
  });

  exportCsvBtn?.addEventListener("click", () => {
    const filtered = getFilteredLogs();
    exportAuditLogsCsv(filtered);
  });

  function getFilteredLogs() {
    const searchTerm = (searchInput?.value || "").toLowerCase().trim();
    const actionVal = actionFilter?.value || "ALL";
    let filtered = allLogs;
    if (actionVal !== "ALL") filtered = filtered.filter((l) => l.action === actionVal);
    if (searchTerm) filtered = filtered.filter((l) =>
      [(l.actorEmail || ""), (l.targetEmail || ""), (l.targetName || ""), (l.action || ""),
       typeof l.details === "object" ? JSON.stringify(l.details) : String(l.details || "")]
        .some((s) => s.toLowerCase().includes(searchTerm))
    );
    return filtered;
  }

  purgeBtn?.addEventListener("click", async () => {
    const adminEmail = getSignedInEmail();
    if (!window.confirm("Purge all audit logs? This action will clear the audit trail in MongoDB.")) return;
    const { ok } = await api("/audit-logs", {
      method: "DELETE",
      body: { adminEmail }
    });
    if (ok) fetchLogs();
  });

  await fetchLogs();
}

// Landing page: rotate the agricultural image gallery every five seconds.
function initLandingPage() {
  const slides = [...document.querySelectorAll(".gallery-slide")];
  const dots = [...document.querySelectorAll(".gallery-dot")];
  const gallery = document.querySelector(".field-gallery");
  if (!slides.length || !gallery) return;

  let currentSlide = 0;
  let rotationTimer;

  const showSlide = (slideIndex) => {
    currentSlide = (slideIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => slide.classList.toggle("is-active", index === currentSlide));
    dots.forEach((dot, index) => {
      const isCurrent = index === currentSlide;
      dot.classList.toggle("is-active", isCurrent);
      if (isCurrent) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  };

  const startRotation = () => {
    window.clearInterval(rotationTimer);
    rotationTimer = window.setInterval(() => showSlide(currentSlide + 1), 5000);
  };

  dots.forEach((dot) => dot.addEventListener("click", () => { showSlide(Number(dot.dataset.gallerySlide)); startRotation(); }));
  gallery.querySelectorAll("[data-gallery-direction]").forEach((button) => button.addEventListener("click", () => {
    const direction = button.dataset.galleryDirection === "next" ? 1 : -1;
    showSlide(currentSlide + direction);
    startRotation();
  }));
  gallery.addEventListener("mouseenter", () => window.clearInterval(rotationTimer));
  gallery.addEventListener("mouseleave", startRotation);
  gallery.addEventListener("focusin", () => window.clearInterval(rotationTimer));
  gallery.addEventListener("focusout", (event) => { if (!gallery.contains(event.relatedTarget)) startRotation(); });
  startRotation();
}

// Start only the behavior needed by the current page.
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "landing") initLandingPage();
  if (page === "login") initLoginPage();
  if (page === "registration") initRegistrationPage();
  if (page === "member") initMemberPage();
  if (page === "applications") initApplicationsPage();
  if (page === "manager") initManagerPage();
  if (page === "admin") initAdminPage();
  if (page === "booking-approvals") initBookingApprovalsPage();
  if (page === "account-management") initAccountManagementPage();
  if (page === "audit-logs") initAuditLogsPage();

  // Initialize Admin Settings modal on all admin sections so Settings is always accessible
  if (["admin", "account-management", "booking-approvals", "audit-logs"].includes(page)) {
    initAdminSettingsDialog();
  }

  // Floating Return to Admin banner for active troubleshooting sessions
  initImpersonationBanner();

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      sessionStorage.removeItem("minders-member-auth");
      sessionStorage.removeItem("minders-member-email");
      sessionStorage.removeItem("minders-account-role");
      window.location.href = "login.html";
    });
  });
});
