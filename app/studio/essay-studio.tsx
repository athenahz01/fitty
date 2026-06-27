"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type EssayType = "personal_statement" | "supplement" | "activity_list";

type Grounding = {
  c7_priorities: { factor: string; importance: string }[];
  exemplars_used: { id: string; theme: string; source_url: string }[];
  admit_context: { tier: string; score: number } | null;
};

type Status = "checking" | "disabled" | "ready";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function EssayStudio() {
  const [status, setStatus] = useState<Status>("checking");
  const [essayType, setEssayType] = useState<EssayType>("personal_statement");
  const [essayText, setEssayText] = useState("");
  const [activities, setActivities] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [refused, setRefused] = useState("");
  const [grounding, setGrounding] = useState<Grounding | null>(null);
  const [feedback, setFeedback] = useState("");
  const [safety, setSafety] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/narrative/status")
      .then((response) => response.json())
      .then((payload) => {
        if (active) {
          setStatus(payload?.enabled === true ? "ready" : "disabled");
        }
      })
      .catch(() => active && setStatus("disabled"));
    return () => {
      active = false;
    };
  }, []);

  async function run() {
    setRunning(true);
    setError("");
    setRefused("");
    setSafety("");
    setGrounding(null);
    setFeedback("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          essay_type: essayType,
          essay_text: essayType === "activity_list" ? "" : essayText,
          activities:
            essayType === "activity_list"
              ? activities.split("\n").map((line) => line.trim()).filter(Boolean)
              : undefined,
          school: schoolName.trim()
            ? { unitid: 0, name: schoolName.trim() }
            : undefined,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const payload = await response.json();
        if (payload?.refused) {
          setRefused(payload.reason);
        } else if (payload?.available === false) {
          setGrounding(payload.grounding ?? null);
          setError(payload.reason ?? "Feedback model is not configured.");
        } else if (!response.ok) {
          setError(payload?.error ?? "Narrative request failed.");
        }
        return;
      }

      // Stream the SSE frames: a deterministic grounding frame first, then text
      // deltas, then a done/safety frame.
      const reader = response.body?.getReader();
      if (!reader) {
        setError("No response stream.");
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice("event:".length).trim();
          let data: unknown = {};
          try {
            data = JSON.parse(dataLine.slice("data:".length).trim());
          } catch {
            continue;
          }
          if (event === "grounding") {
            setGrounding(data as Grounding);
          } else if (event === "delta") {
            setFeedback((current) => current + ((data as { text: string }).text ?? ""));
          } else if (event === "safety") {
            setSafety((data as { message: string }).message ?? "");
          } else if (event === "error") {
            setError((data as { message: string }).message ?? "Feedback failed.");
          }
        }
      }
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError("Narrative request failed.");
      }
    } finally {
      setRunning(false);
    }
  }

  if (status === "checking") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24">
        <div className="h-8 w-56 animate-pulse rounded bg-black/10 dark:bg-white/10" />
      </main>
    );
  }

  if (status === "disabled") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24" data-testid="studio-disabled">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← Admira
        </Link>
        <p className="mt-8 text-lg">Narrative &amp; Essay Studio is not currently open.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16" data-testid="essay-studio">
      <Link href="/" className="text-sm opacity-60 hover:opacity-100">
        ← Admira
      </Link>
      <header className="mt-6">
        <div className="text-xs uppercase tracking-wide opacity-60">
          Narrative &amp; Essay Studio
        </div>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">
          Sharper feedback on your own writing
        </h1>
        <p className="mt-2 max-w-2xl opacity-70">
          Grounded, specific suggestions on your draft — quoting your own words.
          Admira never writes or rewrites your essay for you.
        </p>
      </header>

      <section className="mt-8 grid gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Essay type">
          {(["personal_statement", "supplement", "activity_list"] as EssayType[]).map(
            (type) => (
              <button
                key={type}
                type="button"
                onClick={() => setEssayType(type)}
                data-active={essayType === type}
                className={`rounded-full border px-3 py-1 text-sm ${
                  essayType === type
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/15 dark:border-white/15"
                }`}
              >
                {titleCase(type)}
              </button>
            ),
          )}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Target school (optional)</span>
          <input
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            placeholder="e.g. Massachusetts Institute of Technology"
          />
        </label>

        {essayType === "activity_list" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-70">Your activity entries (one per line)</span>
            <textarea
              className="min-h-32 rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-sm dark:border-white/15"
              value={activities}
              onChange={(event) => setActivities(event.target.value)}
              placeholder={"Captain, Robotics Team — led 12 members to regional finals"}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-70">Your draft (your own writing)</span>
            <textarea
              className="min-h-64 rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
              value={essayText}
              onChange={(event) => setEssayText(event.target.value)}
              placeholder="Paste your draft here. You'll get feedback you apply yourself."
              data-testid="essay-input"
            />
          </label>
        )}

        <div>
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
            data-testid="studio-run"
          >
            {running ? "Reading your draft…" : "Get feedback"}
          </button>
        </div>
      </section>

      {refused ? (
        <p
          className="mt-6 rounded-xl border border-amber-400/40 bg-amber-50/40 p-4 text-sm dark:bg-amber-500/10"
          data-testid="studio-refused"
        >
          {refused}
        </p>
      ) : null}

      {grounding ? (
        <section className="mt-8" data-testid="studio-grounding">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            What this feedback is grounded in
          </h2>
          {grounding.admit_context ? (
            <p className="mt-2 text-sm">
              Admit context (from Admira&apos;s model):{" "}
              <span className="font-semibold">
                {grounding.admit_context.tier} · {grounding.admit_context.score}/100
              </span>
            </p>
          ) : null}
          {grounding.c7_priorities.length > 0 ? (
            <div className="mt-2">
              <div className="text-sm opacity-70">This school&apos;s stated priorities:</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {grounding.c7_priorities.map((priority) => (
                  <span
                    key={priority.factor}
                    className="rounded-full bg-black/5 px-3 py-1 text-xs dark:bg-white/10"
                  >
                    {titleCase(priority.factor)}: {priority.importance}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {grounding.exemplars_used.length > 0 ? (
            <div className="mt-3">
              <div className="text-sm opacity-70">Essay-craft patterns referenced:</div>
              <ul className="mt-1 space-y-1 text-sm">
                {grounding.exemplars_used.map((exemplar) => (
                  <li key={exemplar.id}>
                    <a
                      className="underline opacity-80 hover:opacity-100"
                      href={exemplar.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {exemplar.theme}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {feedback ? (
        <section className="mt-8" data-testid="studio-feedback">
          <h2 className="text-lg font-semibold">Feedback on your draft</h2>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
            {feedback}
          </div>
        </section>
      ) : null}

      {safety ? (
        <p className="mt-4 text-sm text-amber-600 dark:text-amber-400" data-testid="studio-safety">
          {safety}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm opacity-70" data-testid="studio-error">
          {error}
        </p>
      ) : null}
    </main>
  );
}
