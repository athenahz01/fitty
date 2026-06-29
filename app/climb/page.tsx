import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Climb Roadmap | Admira",
  description: "Rank credible next moves without inventing numbers.",
};

export default function ClimbPage() {
  return <AdmiraApp view="climb" />;
}
