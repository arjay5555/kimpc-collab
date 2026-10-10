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
    const response = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
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
    const statusLabel = application.status === "Pending" ? "For approval" : application.status;
    const statusClass = application.status === "Rejected" ? "status-rejected" : application.status === "Approved" ? "status-approved" : "status-pending";
    return `<article class="member-application-row">
      <div class="member-application-equipment"><strong>${escapeHtml(application.equipment)}</strong><small>Requested ${formatApplicationDates(application.startDate, application.endDate)}</small></div>
      <small class="member-application-submitted">Submitted ${new Date(application.submittedAt).toLocaleDateString()}</small>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
    </article>`;
  }).join("");
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
  const renderRentals = (tabName) => {
    list.innerHTML = rentalData[tabName].map((rental) => `
      <article class="rental-card">
        <div class="rental-equipment"><span class="equipment-icon">${rental.icon}</span><div><strong>${rental.equipment}</strong><small>${rental.kind}</small>${rental.operator ? `<small>Operator: ${rental.operator}</small>` : ""}</div></div>
        <div class="date-detail"><small>Rental dates</small><strong>${rental.dates}</strong></div>
        <div class="date-detail"><small>Service location</small><strong>${rental.location}</strong></div>
        <span class="status-badge ${rental.statusClass}">${rental.status}</span>
      </article>`).join("");
  };
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

// Login page: the server checks the email, verification status and password.
function initLoginPage() {
  const requiredRole = new URLSearchParams(window.location.search).get("role");
  if (sessionStorage.getItem("minders-member-auth") === "true") {
    const currentRole = sessionStorage.getItem("minders-account-role") || "member";
    if (!requiredRole || requiredRole === currentRole) {
      window.location.replace(getDashboardForRole(currentRole));
      return;
    }
    sessionStorage.removeItem("minders-member-auth");
    sessionStorage.removeItem("minders-member-email");
    sessionStorage.removeItem("minders-account-role");
  }
  if (requiredRole === "manager" || requiredRole === "admin") {
    const roleName = requiredRole === "manager" ? "Manager" : "Admin";
    document.querySelector("#login-page-eyebrow").textContent = `${roleName.toUpperCase()} PORTAL / SECURE ACCESS`;
    document.querySelector("#login-page-description").textContent = `Sign in with your ${roleName.toLowerCase()} account to access the ${roleName.toLowerCase()} dashboard.`;
    document.querySelector("#login-form-eyebrow").textContent = `${roleName.toUpperCase()} ACCESS`;
    document.querySelector("#login-title").textContent = `Sign in to ${roleName} Dashboard`;
    document.querySelector("#login-registration-divider").hidden = true;
    document.querySelector("#create-member-account").hidden = true;
  }

  const loginForm = document.querySelector("#member-login-form");
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }
    const email = document.querySelector("#member-email").value.trim().toLowerCase();
    const password = document.querySelector("#member-password").value;
    const feedback = document.querySelector("#login-feedback");
    const { ok, data } = await api("/login", { method: "POST", body: { email, password } });
    if (!ok) {
      setFeedback(feedback, data.error || "Could not sign in.", true);
      return;
    }
    const role = data.role || "member";
    if (requiredRole && role !== requiredRole) {
      setFeedback(feedback, `This sign-in is for ${requiredRole} accounts only.`, true);
      return;
    }
    sessionStorage.setItem("minders-member-auth", "true");
    sessionStorage.setItem("minders-member-email", data.email);
    sessionStorage.setItem("minders-account-role", role);
    window.location.href = getDashboardForRole(role);
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

// Manager dashboard: render booking approvals (from MongoDB) and issue cards.
async function initManagerPage() {
  const isAdminCoverage = new URLSearchParams(window.location.search).get("coverage") === "admin";
  const accountRole = sessionStorage.getItem("minders-account-role") || "member";
  const hasAccess = sessionStorage.getItem("minders-member-auth") === "true" && (isAdminCoverage ? accountRole === "admin" : accountRole === "manager");
  if (!hasAccess) {
    window.location.replace(`login.html?role=${isAdminCoverage ? "admin" : "manager"}`);
    return;
  }
  const table = document.querySelector("#approval-table");
  const count = document.querySelector("#pending-count");
  const queueNote = document.querySelector(".table-note");
  document.querySelector("#manager-issues").innerHTML = issueLogs.map((issue) => `<article class="issue-card"><div class="issue-card-header"><div><h3>${issue.type}</h3><p>${issue.detail} / ${issue.location}</p></div>${getIssueBadge(issue)}</div><span class="issue-meta">${issue.owner}</span></article>`).join("");

  if (isAdminCoverage) {
    document.querySelector("#admin-coverage-banner").hidden = false;
    document.querySelector("#manager-user-avatar").textContent = "SA";
    document.querySelector("#manager-user-name").textContent = "System admin";
    document.querySelector("#manager-page-eyebrow").textContent = "ADMIN COVERAGE / GREEN VALLEY CO-OP";
    document.querySelector("#manager-page-title").textContent = "Manager coverage active.";
    document.querySelector("#manager-page-description").textContent = "Review and approve or reject equipment applications while the manager is unavailable.";
  } else {
    const { ok, data } = await api(accountPath(getSignedInEmail()));
    if (ok) {
      const managerName = data.fullName || "Manager";
      document.querySelector("#manager-user-avatar").textContent = getInitials(managerName);
      document.querySelector("#manager-user-name").textContent = managerName;
      document.querySelector("#manager-page-title").textContent = `Good morning, ${managerName.trim().split(/\s+/)[0]}.`;
    }
  }

  const renderBookings = async () => {
    const { ok, data } = await api("/applications");
    const memberApplications = (ok ? data : []).map((application) => ({
      id: application.displayId,
      applicationId: application.id,
      member: application.memberName,
      equipment: application.equipment,
      dates: formatApplicationDates(application.startDate, application.endDate),
      submitted: new Date(application.submittedAt).toLocaleString(),
      status: application.status
    }));
    const allBookings = [...bookings, ...memberApplications];
    table.innerHTML = allBookings.map((booking) => {
      const statusClass = booking.status === "Approved" ? "status-approved" : booking.status === "Rejected" ? "status-rejected" : "status-pending";
      const isPending = booking.status === "Pending";
      return `<tr><td><strong>${escapeHtml(booking.member)}</strong><small>${escapeHtml(booking.id)}</small></td><td>${escapeHtml(booking.equipment)}</td><td>${booking.dates}</td><td>${booking.submitted}</td><td><span class="status-badge ${statusClass}">${booking.status}</span></td><td><div class="action-group"><button class="action-button approve-button" data-booking-action="Approved" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}" ${isPending ? "" : "disabled"}>Approve</button><button class="action-button reject-button" data-booking-action="Rejected" data-booking-id="${escapeHtml(booking.id)}" data-application-id="${escapeHtml(booking.applicationId || "")}" ${isPending ? "" : "disabled"}>Reject</button></div></td></tr>`;
    }).join("");
    const pendingCount = allBookings.filter((booking) => booking.status === "Pending").length;
    count.textContent = pendingCount;
    if (queueNote) queueNote.textContent = `${pendingCount} request${pendingCount === 1 ? "" : "s"} in queue`;
    table.querySelectorAll("[data-booking-action]").forEach((button) => button.addEventListener("click", async () => {
      if (button.dataset.applicationId) {
        // Real application: save the decision in MongoDB.
        const result = await api(`/applications/${encodeURIComponent(button.dataset.applicationId)}`, {
          method: "PATCH",
          body: { status: button.dataset.bookingAction }
        });
        if (result.ok) renderBookings();
        return;
      }
      // Built-in sample booking: demo data only, kept in memory.
      const booking = bookings.find((item) => item.id === button.dataset.bookingId);
      if (booking) { booking.status = button.dataset.bookingAction; renderBookings(); }
    }));
  };
  renderBookings();
  // Pick up new member requests without a manual refresh.
  window.setInterval(renderBookings, 15000);
}

// Administrator dashboard: render the issue monitoring list.
function initAdminPage() {
  const icons = { "Equipment breakdown": "!", "Late return": "L", "Scheduling conflict": "S" };
  document.querySelector("#admin-issues").innerHTML = issueLogs.map((issue) => `<div class="monitor-row"><div class="monitor-type"><span>${icons[issue.type]}</span><strong>${issue.type}</strong></div><small>${issue.location}</small><strong>${issue.detail}</strong>${getIssueBadge(issue)}</div>`).join("");
}


// Account management (admin only): list, create and delete accounts stored in MongoDB.
function initAccountManagementPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true" || sessionStorage.getItem("minders-account-role") !== "admin") {
    window.location.replace("login.html?role=admin");
    return;
  }
  const accountForm = document.querySelector("#staff-account-form");
  const accountList = document.querySelector("#account-list");
  const feedback = document.querySelector("#account-feedback");
  const renderAccounts = async () => {
    const { ok, data } = await api("/accounts");
    const accounts = ok ? data : [];
    accountList.replaceChildren();
    accounts.forEach((account) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const name = document.createElement("strong");
      const accountId = document.createElement("small");
      name.textContent = account.fullName || "Unnamed account";
      accountId.textContent = account.cooperativeId || "Staff account";
      nameCell.append(name, accountId);
      const emailCell = document.createElement("td");
      emailCell.textContent = account.email;
      const roleCell = document.createElement("td");
      roleCell.textContent = ({ admin: "Admin", manager: "Manager" })[account.role] || "Member";
      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = `status-badge ${account.emailVerified ? "status-approved" : "status-pending"}`;
      status.textContent = account.emailVerified ? "Verified" : "Unverified";
      statusCell.append(status);
      const createdCell = document.createElement("td");
      createdCell.textContent = account.createdAt ? new Date(account.createdAt).toLocaleDateString() : "-";
      const actionCell = document.createElement("td");
      actionCell.className = "align-right";
      const deleteButton = document.createElement("button");
      deleteButton.className = "action-button reject-button";
      deleteButton.dataset.deleteAccount = account.email;
      deleteButton.textContent = "Delete";
      actionCell.append(deleteButton);
      row.append(nameCell, emailCell, roleCell, statusCell, createdCell, actionCell);
      accountList.append(row);
    });
    if (!accountList.children.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "accounts-empty";
      cell.textContent = ok ? "No accounts registered yet." : (data.error || "Could not load accounts.");
      row.append(cell);
      accountList.append(row);
    }
  };

  accountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!accountForm.checkValidity()) { accountForm.reportValidity(); return; }
    const formData = new FormData(accountForm);
    const { ok, data } = await api("/accounts", {
      method: "POST",
      body: {
        fullName: String(formData.get("fullName")).trim(),
        email: String(formData.get("email")).trim().toLowerCase(),
        password: formData.get("password"),
        role: formData.get("role")
      }
    });
    if (!ok) {
      setFeedback(feedback, data.error || "Could not create the account.", true);
      return;
    }
    accountForm.reset();
    setFeedback(feedback, "Staff account created and added to the directory.");
    renderAccounts();
  });

  accountList.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-account]");
    if (!deleteButton) return;
    const email = deleteButton.dataset.deleteAccount;
    if (email === getSignedInEmail()) {
      setFeedback(feedback, "You cannot delete the account you are signed in with.", true);
      return;
    }
    if (!window.confirm(`Delete the account for ${email}? This cannot be undone.`)) return;
    const { ok, data } = await api(accountPath(email), { method: "DELETE" });
    setFeedback(feedback, ok ? `Deleted the account for ${email}.` : (data.error || "Could not delete the account."), !ok);
    renderAccounts();
  });
  renderAccounts();
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
  if (page === "account-management") initAccountManagementPage();
});
