import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Improve your chances",
  description: "See the moves that raise your odds the most, based on real data.",
};

export default function ClimbPage() {
  return <AdmiraApp view="climb" />;
}
