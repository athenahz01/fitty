import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Smart List | Admira",
  description: "Build a balanced college list from the shared Admira profile.",
};

export default function ListPage() {
  return <AdmiraApp view="list" />;
}
