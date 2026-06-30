import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Build your list",
  description: "Build a balanced college list of reach, target, and likely schools.",
};

export default function ListPage() {
  return <AdmiraApp view="list" />;
}
