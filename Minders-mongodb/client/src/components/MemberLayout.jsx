import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import MemberSidebar from "./MemberSidebar";
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
    <div className="member-portal" data-theme={theme}>
      <MemberSidebar />
      <main className="member-main">{children || <Outlet />}</main>
    </div>
  );
}
