export function getSignedInEmail() {
  return (sessionStorage.getItem("kimpc-member-email") || sessionStorage.getItem("minders-member-email") || "").trim().toLowerCase();
}

export function getSignedInRole() {
  return sessionStorage.getItem("kimpc-account-role") || sessionStorage.getItem("minders-account-role") || "member";
}

export function getSignedInName() {
  return sessionStorage.getItem("kimpc-account-name") || sessionStorage.getItem("minders-account-name") || "";
}

export function getAuthToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("kimpc-jwt-token") || sessionStorage.getItem("minders-jwt-token") || "";
}

export function isAuthenticated() {
  return sessionStorage.getItem("kimpc-member-auth") === "true" || sessionStorage.getItem("minders-member-auth") === "true";
}

export function getDashboardForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/member";
}

export async function api(path, { method = "GET", body } = {}) {
  try {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";

    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const adminEmail = getSignedInEmail();
    if (adminEmail) headers["x-admin-email"] = adminEmail;

    const response = await fetch(`/api${path}`, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: "Cannot reach the server. Is it running? (npm start)" },
    };
  }
}
