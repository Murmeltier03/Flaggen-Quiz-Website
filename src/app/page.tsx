"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Copy, Crown, Globe2, LogIn, Play, Sparkles, Trophy, Users } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import type { Profile } from "@/lib/types";

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
  const [name, setName] = useState("");
  const [seconds, setSeconds] = useState(20);
  const [target, setTarget] = useState(150);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    jsonRequest<{ profile: Profile }>("/api/profile", { cache: "no-store" })
      .then((data) => setProfile(data.profile))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await jsonRequest<{ profile: Profile }>("/api/profile", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setProfile(data.profile);
      setName("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  async function createGame() {
    setBusy(true);
    setError("");
    try {
      const data = await jsonRequest<{ code: string }>("/api/games", {
        method: "POST",
        body: JSON.stringify({ secondsPerRound: seconds, targetScore: target }),
      });
      window.location.href = `/game/${data.code}`;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Das Spiel konnte nicht erstellt werden.");
      setBusy(false);
    }
  }

  async function joinGame(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await jsonRequest<{ code: string }>("/api/games/join", {
        method: "POST",
        body: JSON.stringify({ code: joinCode }),
      });
      window.location.href = `/game/${data.code}`;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Beitritt fehlgeschlagen.");
      setBusy(false);
    }
  }

  return (
    <main className="landing-shell">
      <nav className="nav wrap">
        <a className="brand" href="#top" aria-label="Flaggenfieber Startseite">
          <span className="brand-mark"><Globe2 size={20} strokeWidth={2.4} /></span>
          <span>Flaggenfieber</span>
        </a>
        <div className="nav-status">
          {profile ? <><PlayerAvatar avatarId={profile.avatarId} size={30} /> <span>{profile.displayName}</span></> : <><span className="status-dot" /> Bereit für die nächste Runde</>}
        </div>
      </nav>

      <section className="hero wrap" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Multiplayer Flag Quiz</div>
          <h1>Flaggen erkennen. <span>Freunde schlagen.</span></h1>
          <p className="hero-lead">Ein schnelles Live-Quiz für den nächsten Spieleabend. Minimal im Aufbau, maximal im Wettbewerb.</p>
          <a className="primary-button hero-button" href="#play">Jetzt spielen <ArrowRight size={17} /></a>
          <div className="hero-points">
            <span><strong>193</strong> Länder</span>
            <span><strong>20</strong> Tier-Avatare</span>
            <span><strong>∞</strong> Revanchen</span>
          </div>
        </div>

        <div className="flag-showcase" aria-label="Vorschau einer Quizrunde">
          <div className="preview-window">
            <div className="preview-top"><span><i /> Live · Runde 08</span><strong>12 Sek.</strong></div>
            <div className="preview-flag"><Image src="/flags/br.png" alt="Flagge von Brasilien" width={340} height={230} priority unoptimized /></div>
            <div className="preview-answer"><span>Land eintippen …</span><ArrowRight size={16} /></div>
            <div className="preview-board">
              <div><PlayerAvatar avatarId="fox" size={34} /><span><b>Yanni</b><small>hat es erkannt</small></span><strong>+10</strong></div>
              <div><PlayerAvatar avatarId="panda" size={34} /><span><b>Mia</b><small>2. Platz</small></span><strong>+9</strong></div>
              <div><PlayerAvatar avatarId="frog" size={34} /><span><b>Leo</b><small>3. Platz</small></span><strong>+8</strong></div>
            </div>
          </div>
        </div>
      </section>

      {profile ? (
        <section className="play-section wrap" id="play" aria-label="Spiel starten oder beitreten">
          <div className="welcome-row">
            <div>
              <p className="section-kicker">Willkommen zurück</p>
              <h2>Bereit, {profile.displayName}?</h2>
            </div>
            <button className="text-button" onClick={() => setProfile(null)}>Name wechseln</button>
          </div>

          <div className="play-grid">
            <article className="panel create-panel">
              <div className="panel-icon lime"><Play size={21} fill="currentColor" /></div>
              <div className="panel-heading">
                <p className="section-kicker">Du bist der Host</p>
                <h3>Neues Spiel erstellen</h3>
                <p>Bestimme das Tempo, teile den Code und starte, wenn alle da sind.</p>
              </div>

              <label className="range-label" htmlFor="seconds">
                <span>Zeit pro Flagge</span><strong>{seconds} Sek.</strong>
              </label>
              <input id="seconds" className="range" type="range" min="8" max="45" step="1" value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} />
              <div className="range-bounds"><span>Schnell</span><span>Entspannt</span></div>

              <label className="range-label" htmlFor="target">
                <span>Punkteziel</span><strong>{target} Pkt.</strong>
              </label>
              <input id="target" className="range" type="range" min="100" max="500" step="25" value={target} onChange={(event) => setTarget(Number(event.target.value))} />
              <div className="range-bounds"><span>100</span><span>500</span></div>

              <button className="primary-button full" onClick={createGame} disabled={busy}>
                Spiel erstellen <ArrowRight size={18} />
              </button>
            </article>

            <article className="panel join-panel">
              <div className="panel-icon violet"><Users size={21} /></div>
              <div className="panel-heading">
                <p className="section-kicker">Deine Freunde warten</p>
                <h3>Mit Code beitreten</h3>
                <p>Gib den sechsstelligen Raumcode ein, den dir der Host geschickt hat.</p>
              </div>
              <form onSubmit={joinGame} className="join-form">
                <label htmlFor="joinCode">Spielcode</label>
                <input id="joinCode" className="code-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} placeholder="AB12CD" autoComplete="off" />
                <button className="secondary-button full" disabled={busy || joinCode.length !== 6}>
                  <LogIn size={18} /> Raum betreten
                </button>
              </form>
              <div className="mini-rule"><Copy size={16} /><span>Der Host findet den Code direkt in seiner Lobby.</span></div>
            </article>

            <aside className="stats-card">
              <PlayerAvatar avatarId={profile.avatarId} size={82} className="stats-avatar" priority />
              <strong>{profile.displayName}</strong>
              <span>Deine Gesamtbilanz</span>
              <div className="stats-list">
                <div><Trophy size={18} /><span><b>{profile.lifetimePoints}</b> Punkte</span></div>
                <div><Play size={18} /><span><b>{profile.gamesPlayed}</b> Spiele</span></div>
                <div><Crown size={18} /><span><b>{profile.victories}</b> Siege</span></div>
              </div>
            </aside>
          </div>
          {error && <p className="error-banner" role="alert">{error}</p>}
        </section>
      ) : (
        <section className="name-section wrap" id="play" aria-label="Spielername eingeben">
          <div className="name-card">
            <div className="name-card-copy">
              <p className="section-kicker">Dein Spielerprofil</p>
              <h2>Unter welchem Namen spielst du?</h2>
              <p>Benutze immer denselben Namen – dann sammeln sich Punkte, Spiele und Siege in deiner persönlichen Bilanz.</p>
              <div className="avatar-lottery">
                <div className="avatar-stack">
                  <PlayerAvatar avatarId="fox" size={42} />
                  <PlayerAvatar avatarId="panda" size={42} />
                  <PlayerAvatar avatarId="owl" size={42} />
                  <PlayerAvatar avatarId="capybara" size={42} />
                </div>
                <span><Sparkles size={14} /><b>Dein Tier wird ausgelost</b>Eins von 20 bleibt dauerhaft bei deinem Namen.</span>
              </div>
            </div>
            <form onSubmit={saveName} className="name-form">
              <label htmlFor="playerName">Spielername</label>
              <div className="input-action">
                <input id="playerName" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={24} placeholder="z. B. Yanni" autoFocus={!checking} />
                <button className="primary-button" disabled={busy || checking || name.trim().length < 2}>{busy ? "Einen Moment …" : "Loslegen"}<ArrowRight size={18} /></button>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <small>Kein Passwort nötig · für private Runden mit Freunden.</small>
            </form>
          </div>
        </section>
      )}

      <section className="rules-strip">
        <div className="wrap rule-items">
          <div><span>01</span><p><b>Raum erstellen</b>Tempo und Ziel festlegen.</p></div>
          <ArrowRight className="rule-arrow" />
          <div><span>02</span><p><b>Code teilen</b>Alle Freunde kommen rein.</p></div>
          <ArrowRight className="rule-arrow" />
          <div><span>03</span><p><b>Schnell tippen</b>10 Punkte für Platz eins.</p></div>
        </div>
      </section>
    </main>
  );
}
