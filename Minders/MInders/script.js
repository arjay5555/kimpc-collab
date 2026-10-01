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

// Browser storage key for demo member accounts.
const memberAccountsStorageKey = "minders-member-accounts";
const memberProfilesStorageKey = "minders-member-profiles";
const equipmentApplicationsStorageKey = "minders-equipment-applications";

// Shared form feedback helper.
function setFeedback(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

// Read accounts saved in this browser. A backend database is required for shared production accounts.
function getMemberAccounts() {
  try {
    return JSON.parse(localStorage.getItem(memberAccountsStorageKey) || "[]");
  } catch {
    return [];
  }
}

// Persist the member account list across browser sessions.
function saveMemberAccounts(accounts) {
  localStorage.setItem(memberAccountsStorageKey, JSON.stringify(accounts));
}

function getMemberProfiles() {
  try {
    return JSON.parse(localStorage.getItem(memberProfilesStorageKey) || "{}");
  } catch {
    return {};
  }
}

function saveMemberProfiles(profiles) {
  localStorage.setItem(memberProfilesStorageKey, JSON.stringify(profiles));
}

function getEquipmentApplications() {
  try {
    return JSON.parse(localStorage.getItem(equipmentApplicationsStorageKey) || "[]");
  } catch {
    return [];
  }
}

function saveEquipmentApplications(applications) {
  localStorage.setItem(equipmentApplicationsStorageKey, JSON.stringify(applications));
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

function renderMemberApplications(listElement, memberEmail) {
  const applications = getEquipmentApplications()
    .filter((application) => application.memberEmail === memberEmail)
    .sort((first, second) => second.submittedAt.localeCompare(first.submittedAt));
  if (!applications.length) {
    listElement.innerHTML = '<p class="member-applications-empty">No applications submitted yet.</p>';
    return;
  }
  listElement.innerHTML = applications.map((application) => {
    const statusLabel = application.status === "Pending" ? "For approval" : application.status;
    const statusClass = application.status === "Rejected" ? "status-rejected" : application.status === "Approved" ? "status-approved" : "status-pending";
    return `<article class="member-application-row">
      <div class="member-application-equipment"><strong>${application.equipment}</strong><small>Requested ${formatApplicationDates(application.startDate, application.endDate)}</small></div>
      <small class="member-application-submitted">Submitted ${new Date(application.submittedAt).toLocaleDateString()}</small>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
    </article>`;
  }).join("");
}

// Create the next sequential Cooperative ID without asking the member to enter one.
function generateCooperativeId() {
  const highestId = getMemberAccounts().reduce((highest, account) => {
    const idMatch = /^CM-(\d+)$/.exec(account.cooperativeId || "");
    return idMatch ? Math.max(highest, Number(idMatch[1])) : highest;
  }, 0);
  return `CM-${String(highestId + 1).padStart(3, "0")}`;
}

// Member dashboard: authentication guard, rental tabs, and rental rendering.
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
  const getProfileOwnerEmail = () => (sessionStorage.getItem("minders-member-email") || "").trim().toLowerCase();
  const profileFields = ["fullName", "email", "phone", "address", "address2", "city", "region", "postalCode", "country"];
  const updateProfileIdentity = (fullName) => {
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    document.querySelector("#header-member-name").textContent = fullName;
    document.querySelector("#profile-avatar").textContent = nameParts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  };
  const populateProfileForm = () => {
    const profileOwnerEmail = getProfileOwnerEmail();
    const account = getMemberAccounts().find((member) => member.email === profileOwnerEmail);
    const profiles = getMemberProfiles();
    const savedProfile = profiles[profileOwnerEmail] || {};
    const values = {
      fullName: savedProfile.fullName || account?.fullName || "Jordan Davis",
      email: savedProfile.email || account?.email || profileOwnerEmail,
      phone: savedProfile.phone || account?.phone || "",
      address: savedProfile.address || account?.address || "",
      address2: savedProfile.address2 || account?.address2 || "",
      city: savedProfile.city || account?.city || "",
      region: savedProfile.region || account?.region || "",
      postalCode: savedProfile.postalCode || account?.postalCode || "",
      country: savedProfile.country || account?.country || ""
    };
    profileFields.forEach((field) => { profileForm.elements.namedItem(field).value = values[field]; });
    updateProfileIdentity(values.fullName);
    const pendingUpdate = savedProfile.pendingUpdate;
    profileForm.hidden = Boolean(pendingUpdate);
    profileVerification.hidden = !pendingUpdate;
    if (pendingUpdate) verificationEmail.textContent = pendingUpdate.email;
  };
  populateProfileForm();
  profileTrigger?.addEventListener("click", () => {
    populateProfileForm();
    profileDialog.showModal();
  });
  document.querySelector("#close-profile")?.addEventListener("click", () => profileDialog.close());
  profileDialog?.addEventListener("click", (event) => {
    if (event.target === profileDialog) profileDialog.close();
  });
  document.querySelector("#logout-button")?.addEventListener("click", () => {
    sessionStorage.removeItem("minders-member-auth");
    sessionStorage.removeItem("minders-member-email");
    window.location.href = "login.html";
  });
  profileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!profileForm.checkValidity()) { profileForm.reportValidity(); return; }
    const profileOwnerEmail = getProfileOwnerEmail();
    const formData = new FormData(profileForm);
    const pendingUpdate = Object.fromEntries(profileFields.map((field) => [field, String(formData.get(field) || "").trim()]));
    pendingUpdate.email = pendingUpdate.email.toLowerCase();
    const accounts = getMemberAccounts();
    if (accounts.some((member) => member.email === pendingUpdate.email && member.email !== profileOwnerEmail)) {
      setFeedback(profileFeedback, "An account already exists for this email address.", true);
      return;
    }
    const profiles = getMemberProfiles();
    profiles[profileOwnerEmail] = { ...profiles[profileOwnerEmail], pendingUpdate };
    saveMemberProfiles(profiles);
    profileForm.hidden = true;
    profileVerification.hidden = false;
    verificationEmail.textContent = pendingUpdate.email;
    setFeedback(profileFeedback, "Profile changes are pending email verification.");
  });
  document.querySelector("#confirm-profile-update")?.addEventListener("click", () => {
    const profileOwnerEmail = getProfileOwnerEmail();
    const profiles = getMemberProfiles();
    const pendingUpdate = profiles[profileOwnerEmail]?.pendingUpdate;
    if (!pendingUpdate) return;
    const accounts = getMemberAccounts();
    const account = accounts.find((member) => member.email === profileOwnerEmail);
    if (account) {
      Object.assign(account, pendingUpdate, { emailVerified: true });
      saveMemberAccounts(accounts);
    }
    const applications = getEquipmentApplications();
    applications.forEach((application) => {
      if (application.memberEmail === profileOwnerEmail) {
        application.memberEmail = pendingUpdate.email;
        application.memberName = pendingUpdate.fullName;
      }
    });
    saveEquipmentApplications(applications);
    profiles[pendingUpdate.email] = { ...profiles[profileOwnerEmail], ...pendingUpdate, emailVerified: true };
    delete profiles[pendingUpdate.email].pendingUpdate;
    if (pendingUpdate.email !== profileOwnerEmail) delete profiles[profileOwnerEmail];
    saveMemberProfiles(profiles);
    sessionStorage.setItem("minders-member-email", pendingUpdate.email);
    updateProfileIdentity(pendingUpdate.fullName);
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
  applicationForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(applicationForm);
    const startDate = formData.get("startDate");
    const endDate = formData.get("endDate");
    if (endDate < startDate) {
      setFeedback(applicationFeedback, "End date must be on or after the start date.", true);
      return;
    }
    const memberEmail = getProfileOwnerEmail();
    const memberAccount = getMemberAccounts().find((member) => member.email === memberEmail);
    const memberProfile = getMemberProfiles()[memberEmail] || {};
    const applications = getEquipmentApplications();
    applications.push({
      id: `APP-${Date.now()}`,
      memberEmail,
      memberName: memberProfile.fullName || memberAccount?.fullName || document.querySelector("#header-member-name").textContent,
      equipment: formData.get("equipment"),
      startDate,
      endDate,
      submittedAt: new Date().toISOString(),
      status: "Pending"
    });
    saveEquipmentApplications(applications);
    setFeedback(applicationFeedback, "Request submitted and waiting for manager approval.");
    applicationForm.reset();
  });

}

function initApplicationsPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true") {
    window.location.replace("login.html");
    return;
  }
  const memberEmail = (sessionStorage.getItem("minders-member-email") || "").trim().toLowerCase();
  const account = getMemberAccounts().find((member) => member.email === memberEmail);
  const profile = getMemberProfiles()[memberEmail] || {};
  const fullName = profile.fullName || account?.fullName || "Jordan Davis";
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  document.querySelector("#header-member-name").textContent = fullName;
  document.querySelector("#profile-avatar").textContent = nameParts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const listElement = document.querySelector("#member-application-list");
  const renderApplications = () => renderMemberApplications(listElement, memberEmail);
  renderApplications();
  window.addEventListener("storage", (event) => {
    if (event.key === equipmentApplicationsStorageKey) renderApplications();
  });
}

// Login page: check the saved email account and require verification.
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
  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }
    const email = document.querySelector("#member-email").value.trim().toLowerCase();
    const password = document.querySelector("#member-password").value;
    const account = getMemberAccounts().find((member) => member.email === email);
    const feedback = document.querySelector("#login-feedback");
    if (!account) {
      setFeedback(feedback, "No account was found for this email address.", true);
      return;
    }
    if (!account.emailVerified) {
      setFeedback(feedback, "Please confirm your email before signing in.", true);
      return;
    }
    if (account.password !== password) {
      setFeedback(feedback, "The email or password is incorrect.", true);
      return;
    }
    const role = account.role || "member";
    if (requiredRole && role !== requiredRole) {
      setFeedback(feedback, `This sign-in is for ${requiredRole} accounts only.`, true);
      return;
    }
    sessionStorage.setItem("minders-member-auth", "true");
    sessionStorage.setItem("minders-member-email", email);
    sessionStorage.setItem("minders-account-role", role);
    window.location.href = getDashboardForRole(role);
  });
}

// Registration page: create a pending account and complete email verification.
function initRegistrationPage() {
  const registrationForm = document.querySelector("#registration-form");
  const cooperativeIdInput = document.querySelector("#cooperative-id");
  const verificationPanel = document.querySelector("#verification-panel");
  const verificationEmail = document.querySelector("#verification-email");
  const confirmEmailButton = document.querySelector("#confirm-email-button");
  cooperativeIdInput.value = generateCooperativeId();

  registrationForm?.addEventListener("submit", (event) => {
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
    const accounts = getMemberAccounts();
    if (accounts.some((account) => account.email === email)) {
      setFeedback(feedback, "An account already exists for this email address.", true);
      return;
    }
    accounts.push({
      fullName: formData.get("fullName").trim(),
      email,
      password,
      role: "member",
      cooperativeId: cooperativeIdInput.value,
      emailVerified: false,
      createdAt: new Date().toISOString()
    });
    saveMemberAccounts(accounts);
    verificationEmail.textContent = email;
    registrationForm.hidden = true;
    verificationPanel.hidden = false;
    setFeedback(feedback, "Registration saved. Confirm your email to activate your account.");
  });

  confirmEmailButton?.addEventListener("click", () => {
    const email = verificationEmail.textContent;
    const accounts = getMemberAccounts();
    const account = accounts.find((member) => member.email === email);
    if (!account) return;
    account.emailVerified = true;
    account.verifiedAt = new Date().toISOString();
    saveMemberAccounts(accounts);
    setFeedback(document.querySelector("#verification-feedback"), "Account verified. Redirecting to login...");
    window.setTimeout(() => { window.location.href = "login.html"; }, 900);
  });
}

// Convert an issue status into the shared badge markup.
function getIssueBadge(issue) { return `<span class="status-badge ${issue.statusClass}">${issue.status}</span>`; }

// Manager dashboard: render booking approvals and issue cards.
function initManagerPage() {
  const isAdminCoverage = new URLSearchParams(window.location.search).get("coverage") === "admin";
  const accountRole = sessionStorage.getItem("minders-account-role") || "member";
  const hasAccess = sessionStorage.getItem("minders-member-auth") === "true" && (isAdminCoverage ? accountRole === "admin" : accountRole === "manager");
  if (!hasAccess) {
    window.location.replace(`login.html?role=${isAdminCoverage ? "admin" : "manager"}`);
    return;
  }
  const signedInEmail = (sessionStorage.getItem("minders-member-email") || "").trim().toLowerCase();
  const signedInAccount = getMemberAccounts().find((account) => account.email === signedInEmail);
  if (!isAdminCoverage && signedInAccount) {
    const managerName = signedInAccount.fullName || "Manager";
    const nameParts = managerName.trim().split(/\s+/).filter(Boolean);
    document.querySelector("#manager-user-avatar").textContent = nameParts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    document.querySelector("#manager-user-name").textContent = managerName;
    document.querySelector("#manager-page-title").textContent = `Good morning, ${nameParts[0]}.`;
  }
  const table = document.querySelector("#approval-table");
  const count = document.querySelector("#pending-count");
  const queueNote = document.querySelector(".table-note");
  if (isAdminCoverage) {
    document.querySelector("#admin-coverage-banner").hidden = false;
    document.querySelector("#manager-user-avatar").textContent = "SA";
    document.querySelector("#manager-user-name").textContent = "System admin";
    document.querySelector("#manager-page-eyebrow").textContent = "ADMIN COVERAGE / GREEN VALLEY CO-OP";
    document.querySelector("#manager-page-title").textContent = "Manager coverage active.";
    document.querySelector("#manager-page-description").textContent = "Review and approve or reject equipment applications while the manager is unavailable.";
  }
  const renderBookings = () => {
    const memberApplications = getEquipmentApplications().map((application) => ({
      id: application.id,
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
      return `<tr><td><strong>${booking.member}</strong><small>${booking.id}</small></td><td>${booking.equipment}</td><td>${booking.dates}</td><td>${booking.submitted}</td><td><span class="status-badge ${statusClass}">${booking.status}</span></td><td><div class="action-group"><button class="action-button approve-button" data-booking-action="Approved" data-booking-id="${booking.id}" data-application-id="${booking.applicationId || ""}" ${isPending ? "" : "disabled"}>Approve</button><button class="action-button reject-button" data-booking-action="Rejected" data-booking-id="${booking.id}" data-application-id="${booking.applicationId || ""}" ${isPending ? "" : "disabled"}>Reject</button></div></td></tr>`;
    }).join("");
    const pendingCount = allBookings.filter((booking) => booking.status === "Pending").length;
    count.textContent = pendingCount;
    if (queueNote) queueNote.textContent = `${pendingCount} request${pendingCount === 1 ? "" : "s"} in queue`;
    table.querySelectorAll("[data-booking-action]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.applicationId) {
        const applications = getEquipmentApplications();
        const application = applications.find((item) => item.id === button.dataset.applicationId);
        if (application) {
          application.status = button.dataset.bookingAction;
          saveEquipmentApplications(applications);
          renderBookings();
        }
        return;
      }
      const booking = bookings.find((item) => item.id === button.dataset.bookingId);
      if (booking) { booking.status = button.dataset.bookingAction; renderBookings(); }
    }));
  };
  renderBookings();
  document.querySelector("#manager-issues").innerHTML = issueLogs.map((issue) => `<article class="issue-card"><div class="issue-card-header"><div><h3>${issue.type}</h3><p>${issue.detail} / ${issue.location}</p></div>${getIssueBadge(issue)}</div><span class="issue-meta">${issue.owner}</span></article>`).join("");
}

// Administrator dashboard: render the issue monitoring list.
function initAdminPage() {
  const icons = { "Equipment breakdown": "!", "Late return": "L", "Scheduling conflict": "S" };
  document.querySelector("#admin-issues").innerHTML = issueLogs.map((issue) => `<div class="monitor-row"><div class="monitor-type"><span>${icons[issue.type]}</span><strong>${issue.type}</strong></div><small>${issue.location}</small><strong>${issue.detail}</strong>${getIssueBadge(issue)}</div>`).join("");
}

function initAccountManagementPage() {
  const accountForm = document.querySelector("#staff-account-form");
  const accountList = document.querySelector("#account-list");
  const feedback = document.querySelector("#account-feedback");
  const renderAccounts = () => {
    accountList.replaceChildren();
    getMemberAccounts().forEach((account) => {
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
      cell.textContent = "No accounts registered yet.";
      row.append(cell);
      accountList.append(row);
    }
  };

  accountForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!accountForm.checkValidity()) { accountForm.reportValidity(); return; }
    const formData = new FormData(accountForm);
    const email = String(formData.get("email")).trim().toLowerCase();
    const accounts = getMemberAccounts();
    if (accounts.some((account) => account.email.toLowerCase() === email)) {
      setFeedback(feedback, "An account already exists for this email address.", true);
      return;
    }
    accounts.push({
      fullName: String(formData.get("fullName")).trim(),
      email,
      password: formData.get("password"),
      role: formData.get("role"),
      emailVerified: true,
      createdAt: new Date().toISOString()
    });
    saveMemberAccounts(accounts);
    accountForm.reset();
    setFeedback(feedback, "Staff account created and added to the directory.");
    renderAccounts();
  });

  accountList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-account]");
    if (!deleteButton) return;
    const email = deleteButton.dataset.deleteAccount;
    if (!window.confirm(`Delete the account for ${email}? This cannot be undone.`)) return;
    saveMemberAccounts(getMemberAccounts().filter((account) => account.email !== email));
    setFeedback(feedback, `Deleted the account for ${email}.`);
    renderAccounts();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === memberAccountsStorageKey) renderAccounts();
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
