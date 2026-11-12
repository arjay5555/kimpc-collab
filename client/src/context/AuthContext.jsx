import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, getSignedInEmail, getSignedInRole, getSignedInName, getAuthToken, isAuthenticated, clearApiCache } from "../services/api";
import { initOneSignal, logoutOneSignal } from "../services/oneSignal";

const AuthContext = createContext(null);

const AUTH_STORAGE_KEYS = [
  "kimpc-member-auth",
  "kimpc-member-email",
  "kimpc-account-role",
  "kimpc-account-name",
  "kimpc-jwt-token",
  "minders-member-auth",
  "minders-member-email",
  "minders-account-role",
  "minders-account-name",
  "minders-jwt-token",
];

function clearStoredAuthSession() {
  clearApiCache();
  for (const key of AUTH_STORAGE_KEYS) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
  localStorage.removeItem("token");
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (isAuthenticated()) {
      return {
        email: getSignedInEmail(),
        role: getSignedInRole(),
        fullName: getSignedInName(),
        token: getAuthToken(),
      };
    }
    return null;
  });

  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearStoredAuthSession();
    logoutOneSignal();
    setUser(null);
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      setUser({
        email: getSignedInEmail(),
        role: getSignedInRole(),
        fullName: getSignedInName(),
        token: getAuthToken(),
      });
    } else {
      clearStoredAuthSession();
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      logout();
    };
    window.addEventListener("kimpc:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("kimpc:auth-expired", handleAuthExpired);
  }, [logout]);

  useEffect(() => {
    if (user?.email) {
      initOneSignal(user);
    }
  }, [user?.email]);

  const completeSignIn = (data, options = {}) => {
    const role = data.role || "member";
    const rememberMe = Boolean(options.rememberMe ?? data.rememberMe);
    const values = {
      "kimpc-member-auth": "true",
      "kimpc-member-email": data.email || "",
      "kimpc-account-role": role,
      "kimpc-account-name": data.fullName || "",
      "minders-member-auth": "true",
      "minders-member-email": data.email || "",
      "minders-account-role": role,
      "minders-account-name": data.fullName || "",
      ...(data.token
        ? {
            "kimpc-jwt-token": data.token,
            "minders-jwt-token": data.token,
          }
        : {}),
    };

    for (const [key, val] of Object.entries(values)) {
      sessionStorage.setItem(key, val);
      if (rememberMe) {
        localStorage.setItem(key, val);
      } else {
        localStorage.removeItem(key);
      }
    }

    if (rememberMe && data.token) {
      localStorage.setItem("token", data.token);
    } else {
      localStorage.removeItem("token");
    }

    const newUser = {
      email: data.email || "",
      role,
      fullName: data.fullName || "",
      avatar: data.avatar || localStorage.getItem(`kimpc-avatar-${data.email}`) || "",
      token: data.token || "",
    };
    setUser(newUser);
    initOneSignal(newUser);
    return newUser;
  };

  const updateProfile = ({ fullName, avatar }) => {
    if (fullName) {
      sessionStorage.setItem("kimpc-account-name", fullName);
      sessionStorage.setItem("minders-account-name", fullName);
      if (localStorage.getItem("kimpc-member-auth") === "true") {
        localStorage.setItem("kimpc-account-name", fullName);
        localStorage.setItem("minders-account-name", fullName);
      }
    }
    if (avatar !== undefined) {
      if (avatar) {
        localStorage.setItem(`kimpc-avatar-${user?.email || "current"}`, avatar);
      } else {
        localStorage.removeItem(`kimpc-avatar-${user?.email || "current"}`);
      }
    }
    setUser((current) => (current ? { ...current, ...(fullName ? { fullName } : {}), ...(avatar !== undefined ? { avatar } : {}) } : current));
  };

  const login = async (identifier, password, recaptchaToken = "", rememberMe = false) => {
    const res = await api("/login", {
      method: "POST",
      body: { identifier, password, recaptchaToken, rememberMe: Boolean(rememberMe) },
    });
    return res;
  };

  const register = async ({ fullName, cooperativeId, email, password }) => {
    const res = await api("/register", {
      method: "POST",
      body: { fullName, cooperativeId, email, password },
    });
    return res;
  };

  const verifyEmail = async (email) => {
    const res = await api("/verify", {
      method: "POST",
      body: { email },
    });
    return res;
  };

  const forgotPassword = async (identifier) => {
    const res = await api("/auth/forgot-password-request", {
      method: "POST",
      body: { identifier },
    });
    return res;
  };

  const changeTempPassword = async ({ email, tempPassword, newPassword, confirmPassword }) => {
    const res = await api("/auth/change-temp-password", {
      method: "POST",
      body: { email, tempPassword, newPassword, confirmPassword },
    });
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        verifyEmail,
        forgotPassword,
        changeTempPassword,
        completeSignIn,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
