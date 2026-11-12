import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import MemberSidebar from "./MemberSidebar";
import "../styles/admin-kimpc.css";
import "../styles/member-portal.css";

export default function MemberLayout({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("member-theme") || "light");

  useEffect(() => {
    const syncTheme = (event) => {
      setTheme(event.detail || localStorage.getItem("member-theme") || "light");
    };
    window.addEventListener("member-theme-change", syncTheme);
    return () => window.removeEventListener("member-theme-change", syncTheme);
  }, []);

  return (
    <div className="wz-dashboard-container member-portal" data-theme={theme}>
      <MemberSidebar />
      <main className="wz-content-wrapper member-main">{children || <Outlet />}</main>
    </div>
  );
}
