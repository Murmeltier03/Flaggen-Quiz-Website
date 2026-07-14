"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Clock3,
  DoorOpen,
  Globe2,
  LogIn,
  Plus,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { Profile } from "@/lib/types";

type EntryMode = "create" | "join" | null;

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Anfrage fehlgeschlagen.");
  return body;
}

export default function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);
  const [entryMode, setEntryMode] = useState<EntryMode>(null);
  const [name, setName] = useState("");
  const [seconds, setSeconds] = useState(20);
  const [target, setTarget] = useState(150);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const nameEdited = useRef(false);

  useEffect(() => {
    jsonRequest<{ profile: Profile }>("/api/profile", { cache: "no-store" })
      .then((data) => {
        setProfile(data.profile);
        if (!nameEdited.current) setName(data.profile.displayName);
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!entryMode) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [entryMode]);

  useEffect(() => {
    if (!entryMode) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      dialogRef.current?.close();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [busy, entryMode]);

  function openEntry(mode: Exclude<EntryMode, null>, opener: HTMLButtonElement) {
    openerRef.current = opener;
    setError("");
    setEntryMode(mode);
  }

  function closeEntry() {
    if (busy) return;
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    setEntryMode(null);
    setError("");
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (outside) closeEntry();
  }

  async function ensureProfile() {
    const displayName = name.trim();
    if (displayName.length < 2) throw new Error("Bitte gib zuerst deinen Namen ein.");
    if (profile && profile.displayName.localeCompare(displayName, "de", { sensitivity: "base" }) === 0) {
      return profile;
    }
    const data = await jsonRequest<{ profile: Profile }>("/api/profile", {
      method: "POST",
      body: JSON.stringify({ name: displayName }),
    });
    setProfile(data.profile);
    setName(data.profile.displayName);
    return data.profile;
  }

  async function createGame(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      await ensureProfile();
      const data = await jsonRequest<{ code: string }>("/api/games", {
        method: "POST",
        body: JSON.stringify({ secondsPerRound: seconds, targetScore: target }),
      });
      window.location.href = "/game/" + data.code;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Das Spiel konnte nicht erstellt werden.");
      setBusy(null);
    }
  }

  async function joinGame(event: React.FormEvent) {
    event.preventDefault();
    setBusy("join");
    setError("");
    try {
      await ensureProfile();
      const data = await jsonRequest<{ code: string }>("/api/games/join", {
        method: "POST",
        body: JSON.stringify({ code: joinCode }),
      });
      window.location.href = "/game/" + data.code;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Beitritt fehlgeschlagen.");
      setBusy(null);
    }
  }

  const nameReady = name.trim().length >= 2;
  const dialogTitle = entryMode === "create" ? "Neuen Raum erstellen" : "Raum beitreten";
  const dialogDescription = entryMode === "create"
    ? "Lege kurz die Runde fest. Den Einladungscode bekommst du direkt danach."
    : "Gib deinen Namen und den Code ein, den du vom Host bekommen hast.";

  return (
    <main className={"home-shell " + (entryMode ? "has-entry-dialog" : "")}>
      <div className="ambient-orb ambient-orb-one" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-two" aria-hidden="true" />

      <header className="home-nav">
        <div className="brand" aria-label="Flaggenfieber">
          <span className="brand-mark"><Globe2 size={19} strokeWidth={2.2} /></span>
          <span>Flaggenfieber</span>
        </div>
        <span className="quiet-status">Privates Spiel · kein Login</span>
      </header>

      <section className="home-content choice-content" aria-labelledby="home-title">
        <div className="home-intro choice-intro">
          <span className="eyebrow"><i /> Multiplayer-Quiz</span>
          <h1 id="home-title">Wie möchtest du spielen?</h1>
          <p>Wähle zuerst, was du vorhast. Alles Weitere kommt im nächsten Schritt.</p>
        </div>

        <div className="choice-grid">
          <button
            className="choice-card glass-panel"
            type="button"
            aria-haspopup="dialog"
            onClick={(event) => openEntry("create", event.currentTarget)}
          >
            <span className="entry-icon blue"><Plus size={22} /></span>
            <span className="choice-copy">
              <small>Als Host</small>
              <strong>Raum erstellen</strong>
              <span>Runde einstellen und Einladungscode erhalten.</span>
            </span>
            <span className="choice-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
          </button>

          <button
            className="choice-card glass-panel"
            type="button"
            aria-haspopup="dialog"
            onClick={(event) => openEntry("join", event.currentTarget)}
          >
            <span className="entry-icon green"><DoorOpen size={22} /></span>
            <span className="choice-copy">
              <small>Mit Einladung</small>
              <strong>Raum beitreten</strong>
              <span>Mit dem sechsstelligen Code direkt mitspielen.</span>
            </span>
            <span className="choice-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
          </button>
        </div>
      </section>

      {entryMode && (
        <dialog
          ref={dialogRef}
          className="entry-dialog"
          aria-labelledby="entry-dialog-title"
          aria-describedby="entry-dialog-description"
          onCancel={(event) => {
            event.preventDefault();
            closeEntry();
          }}
          onClose={handleDialogClose}
          onClick={handleBackdropClick}
        >
          <form
            className="entry-dialog-surface glass-panel"
            onSubmit={entryMode === "create" ? createGame : joinGame}
          >
            <div className="dialog-header">
              <span className={"entry-icon " + (entryMode === "create" ? "blue" : "green")}>
                {entryMode === "create" ? <Plus size={22} /> : <DoorOpen size={22} />}
              </span>
              <div>
                <small>{entryMode === "create" ? "Als Host" : "Mit Einladung"}</small>
                <h2 id="entry-dialog-title">{dialogTitle}</h2>
              </div>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fenster schließen"
                onClick={closeEntry}
                disabled={Boolean(busy)}
              >
                <X size={19} />
              </button>
            </div>

            <p className="dialog-description" id="entry-dialog-description">{dialogDescription}</p>

            <label className="dialog-field" htmlFor="player-name">
              <span>Dein Name</span>
              <div className="dialog-input-wrap">
                <Sparkles size={17} aria-hidden="true" />
                <input
                  ref={nameInputRef}
                  id="player-name"
                  value={name}
                  onChange={(event) => {
                    nameEdited.current = true;
                    setName(event.target.value);
                  }}
                  minLength={2}
                  maxLength={24}
                  placeholder={checking ? "Profil wird geprüft …" : "Name eingeben"}
                  autoComplete="nickname"
                  disabled={Boolean(busy)}
                  required
                />
              </div>
              <small>Der gleiche Name führt dich wieder zu deinem Punktestand.</small>
            </label>

            {entryMode === "create" ? (
              <div className="dialog-settings">
                <div className="setting-row">
                  <div className="setting-label"><Clock3 size={17} /><span>Zeit pro Flagge</span><strong>{seconds} Sek.</strong></div>
                  <input
                    aria-label={"Zeit pro Flagge " + seconds + " Sekunden"}
                    className="range"
                    type="range"
                    min="8"
                    max="45"
                    step="1"
                    value={seconds}
                    onChange={(event) => setSeconds(Number(event.target.value))}
                    disabled={Boolean(busy)}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-label"><Target size={17} /><span>Punkteziel</span><strong>{target}</strong></div>
                  <input
                    aria-label={"Punkteziel " + target}
                    className="range"
                    type="range"
                    min="100"
                    max="500"
                    step="25"
                    value={target}
                    onChange={(event) => setTarget(Number(event.target.value))}
                    disabled={Boolean(busy)}
                  />
                </div>
              </div>
            ) : (
              <label className="dialog-field" htmlFor="joinCode">
                <span>Raumcode</span>
                <input
                  id="joinCode"
                  className="code-input"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))}
                  placeholder="AB12CD"
                  autoComplete="off"
                  inputMode="text"
                  pattern="[A-HJ-NP-Z2-9]{6}"
                  disabled={Boolean(busy)}
                  required
                />
              </label>
            )}

            {error && <p className="error-banner dialog-error" role="alert">{error}</p>}

            <button
              className="primary-button dialog-submit"
              disabled={Boolean(busy) || !nameReady || (entryMode === "join" && joinCode.length !== 6)}
            >
              {entryMode === "create" ? (
                <>{busy === "create" ? "Raum wird erstellt …" : "Raum erstellen"}{busy !== "create" && <ArrowRight size={18} />}</>
              ) : (
                <><LogIn size={18} />{busy === "join" ? "Raum wird geöffnet …" : "Raum beitreten"}</>
              )}
            </button>
          </form>
        </dialog>
      )}
    </main>
  );
}
