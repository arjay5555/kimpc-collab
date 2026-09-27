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
    { equipment: "John Deere 5075E", kind: "Tractor", dates: "Sep 20 - Sep 23", location: "North field", status: "Active", statusClass: "status-active", icon: "JD" },
    { equipment: "Kuhn Disc Mower", kind: "Mower", dates: "Sep 21 - Sep 22", location: "South shed", status: "Active", statusClass: "status-active", icon: "KM" }
  ],
  upcoming: [
    { equipment: "New Holland Baler", kind: "Baler", dates: "Sep 27 - Sep 29", location: "East field", status: "Approved", statusClass: "status-approved", icon: "NH" },
    { equipment: "Case IH Tractor", kind: "Tractor", dates: "Oct 02 - Oct 04", location: "North field", status: "Approved", statusClass: "status-approved", icon: "CI" },
    { equipment: "JCB Loader", kind: "Loader", dates: "Oct 07 - Oct 08", location: "Central yard", status: "Pending", statusClass: "status-pending", icon: "JCB" }
  ],
  past: [
    { equipment: "Massey Ferguson 4707", kind: "Tractor", dates: "Sep 12 - Sep 14", location: "West field", status: "Completed", statusClass: "status-resolved", icon: "MF" },
    { equipment: "Hesston Windrower", kind: "Windrower", dates: "Sep 05 - Sep 07", location: "South field", status: "Completed", statusClass: "status-resolved", icon: "HW" }
  ]
};

// Shared form feedback helper.
function setFeedback(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

// Member dashboard: authentication guard, rental tabs, and rental rendering.
function initMemberPage() {
  if (sessionStorage.getItem("minders-member-auth") !== "true") {
    window.location.replace("login.html");
    return;
  }
  const list = document.querySelector("#rental-list");
  const renderRentals = (tabName) => {
    list.innerHTML = rentalData[tabName].map((rental) => `
      <article class="rental-card">
        <div class="rental-equipment"><span class="equipment-icon">${rental.icon}</span><div><strong>${rental.equipment}</strong><small>${rental.kind}</small></div></div>
        <div class="date-detail"><small>Rental dates</small><strong>${rental.dates}</strong></div>
        <div class="date-detail"><small>Pickup location</small><strong>${rental.location}</strong></div>
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

}

// Login page: credential validation and two-step verification modal.
function initLoginPage() {
  if (sessionStorage.getItem("minders-member-auth") === "true") {
    window.location.replace("member.html");
    return;
  }

  const loginForm = document.querySelector("#member-login-form");
  const otpModal = document.querySelector("#otp-modal");
  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }
    otpModal.hidden = false;
    document.querySelector("#otp-code")?.focus();
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => { otpModal.hidden = true; }));
  document.querySelector("#otp-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    sessionStorage.setItem("minders-member-auth", "true");
    window.location.href = "member.html";
  });
}

// Registration page: validate and acknowledge new member details.
function initRegistrationPage() {
  document.querySelector("#registration-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setFeedback(document.querySelector("#registration-feedback"), "Details received. Check your phone for the next step.");
  });
}

// Convert an issue status into the shared badge markup.
function getIssueBadge(issue) { return `<span class="status-badge ${issue.statusClass}">${issue.status}</span>`; }

// Manager dashboard: render booking approvals and issue cards.
function initManagerPage() {
  const table = document.querySelector("#approval-table");
  const count = document.querySelector("#pending-count");
  const queueNote = document.querySelector(".table-note");
  const renderBookings = () => {
    table.innerHTML = bookings.map((booking) => {
      const statusClass = booking.status === "Approved" ? "status-approved" : booking.status === "Rejected" ? "status-rejected" : "status-pending";
      const isPending = booking.status === "Pending";
      return `<tr><td><strong>${booking.member}</strong><small>${booking.id}</small></td><td>${booking.equipment}</td><td>${booking.dates}</td><td>${booking.submitted}</td><td><span class="status-badge ${statusClass}">${booking.status}</span></td><td><div class="action-group"><button class="action-button approve-button" data-booking-action="Approved" data-booking-id="${booking.id}" ${isPending ? "" : "disabled"}>Approve</button><button class="action-button reject-button" data-booking-action="Rejected" data-booking-id="${booking.id}" ${isPending ? "" : "disabled"}>Reject</button></div></td></tr>`;
    }).join("");
    const pendingCount = bookings.filter((booking) => booking.status === "Pending").length;
    count.textContent = pendingCount;
    if (queueNote) queueNote.textContent = `${pendingCount} request${pendingCount === 1 ? "" : "s"} in queue`;
    table.querySelectorAll("[data-booking-action]").forEach((button) => button.addEventListener("click", () => {
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
  if (page === "manager") initManagerPage();
  if (page === "admin") initAdminPage();
});
