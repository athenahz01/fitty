import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "School Universe | Admira",
  description: "Search schools and open honest chance reads.",
};

export default function SchoolsPage() {
  return <AdmiraApp view="schools" />;
}
