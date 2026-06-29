"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ApplicationRound = "regular" | "early";

export type Profile = {
  gpa: string;
  canadianAverage: string;
  sat: string;
  act: string;
  notSubmittingTests: boolean;
  intendedMajor: string;
  applicationRound: ApplicationRound;
  homeState: string;
  activityNote: string;
  completedPrerequisites: string;
};

export const initialProfile: Profile = {
  gpa: "3.85",
  canadianAverage: "92",
  sat: "1480",
  act: "",
  notSubmittingTests: false,
  intendedMajor: "Undecided",
  applicationRound: "regular",
  homeState: "NY",
  activityNote: "",
  completedPrerequisites: "ENG4U, MHF4U, MCV4U",
};

type AdmiraProfileContextValue = {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  profileHydrated: boolean;
};

const STORAGE_KEY = "admira-profile";
const AdmiraProfileContext = createContext<AdmiraProfileContextValue | null>(null);

function coerceProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Profile>;
  return {
    gpa: typeof candidate.gpa === "string" ? candidate.gpa : initialProfile.gpa,
    canadianAverage:
      typeof candidate.canadianAverage === "string"
        ? candidate.canadianAverage
        : initialProfile.canadianAverage,
    sat: typeof candidate.sat === "string" ? candidate.sat : initialProfile.sat,
    act: typeof candidate.act === "string" ? candidate.act : initialProfile.act,
    notSubmittingTests:
      typeof candidate.notSubmittingTests === "boolean"
        ? candidate.notSubmittingTests
        : initialProfile.notSubmittingTests,
    intendedMajor:
      typeof candidate.intendedMajor === "string"
        ? candidate.intendedMajor
        : initialProfile.intendedMajor,
    applicationRound:
      candidate.applicationRound === "early" ? "early" : initialProfile.applicationRound,
    homeState:
      typeof candidate.homeState === "string"
        ? candidate.homeState
        : initialProfile.homeState,
    activityNote:
      typeof candidate.activityNote === "string"
        ? candidate.activityNote
        : initialProfile.activityNote,
    completedPrerequisites:
      typeof candidate.completedPrerequisites === "string"
        ? candidate.completedPrerequisites
        : initialProfile.completedPrerequisites,
  };
}

export function AdmiraProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [profileHydrated, setProfileHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? coerceProfile(JSON.parse(stored)) : null;
      if (parsed) {
        setProfile(parsed);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setProfileHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!profileHydrated) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, profileHydrated]);

  const value = useMemo(
    () => ({ profile, setProfile, profileHydrated }),
    [profile, profileHydrated],
  );

  return (
    <AdmiraProfileContext.Provider value={value}>
      {children}
    </AdmiraProfileContext.Provider>
  );
}

export function useAdmiraProfile() {
  const context = useContext(AdmiraProfileContext);
  if (!context) {
    throw new Error("useAdmiraProfile must be used within AdmiraProfileProvider.");
  }
  return context;
}
