import React, { createContext, useContext, useState, useEffect } from "react";
import { api, getSignedInEmail, getSignedInRole, getSignedInName, getAuthToken, isAuthenticated } from "../services/api";

const AuthContext = createContext(null);

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

  useEffect(() => {
    if (isAuthenticated()) {
      setUser({
        email: getSignedInEmail(),
        role: getSignedInRole(),
        fullName: getSignedInName(),
        token: getAuthToken(),
      });
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  const completeSignIn = (data) => {
    const role = data.role || "member";
    if (data.token) {
      localStorage.setItem("token", data.token);
      sessionStorage.setItem("kimpc-jwt-token", data.token);
      sessionStorage.setItem("minders-jwt-token", data.token);
    }
    sessionStorage.setItem("kimpc-member-auth", "true");
    sessionStorage.setItem("kimpc-member-email", data.email || "");
    sessionStorage.setItem("kimpc-account-role", role);
    sessionStorage.setItem("kimpc-account-name", data.fullName || "");
    sessionStorage.setItem("minders-member-auth", "true");
    sessionStorage.setItem("minders-member-email", data.email || "");
    sessionStorage.setItem("minders-account-role", role);
    sessionStorage.setItem("minders-account-name", data.fullName || "");

    const newUser = {
      email: data.email || "",
      role,
      fullName: data.fullName || "",
      token: data.token || "",
    };
    setUser(newUser);
    return newUser;
  };

  const login = async (identifier, password, recaptchaToken = "") => {
    const res = await api("/login", {
      method: "POST",
      body: { identifier, password, recaptchaToken },
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

  const logout = () => {
    sessionStorage.removeItem("kimpc-member-auth");
    sessionStorage.removeItem("kimpc-member-email");
    sessionStorage.removeItem("kimpc-account-role");
    sessionStorage.removeItem("kimpc-account-name");
    sessionStorage.removeItem("kimpc-jwt-token");
    sessionStorage.removeItem("minders-member-auth");
    sessionStorage.removeItem("minders-member-email");
    sessionStorage.removeItem("minders-account-role");
    sessionStorage.removeItem("minders-account-name");
    sessionStorage.removeItem("minders-jwt-token");
    localStorage.removeItem("token");
    setUser(null);
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
