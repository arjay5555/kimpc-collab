import React from "react";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerTopbar from "../../components/ManagerTopbar";
import ReportsWorkspace from "../../components/ReportsWorkspace";

export default function ManagerReports() {
  return (
    <ReportsWorkspace
      sidebar={<ManagerSidebar />}
      topbar={<ManagerTopbar title="Reports" />}
    />
  );
}
