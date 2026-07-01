import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Costs and aid",
  description: "Net price, merit aid, and ROI from sourced inputs.",
};

export default function MoneyPage() {
  return <AdmiraApp view="money" />;
}
