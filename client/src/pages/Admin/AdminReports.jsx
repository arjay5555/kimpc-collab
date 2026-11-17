import React from "react";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import ReportsWorkspace from "../../components/ReportsWorkspace";

export default function AdminReports() {
  return (
    <ReportsWorkspace
      sidebar={<AdminSidebar />}
      topbar={<AdminTopbar title="Reports" />}
    />
  );
}
