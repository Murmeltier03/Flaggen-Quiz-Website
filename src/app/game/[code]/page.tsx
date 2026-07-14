"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Crown, Flag, Globe2, Home, Medal, Play, Timer, Trophy, Users, Volume2, Zap } from "lucide-react";
import countries from "@/data/countries.json";
import { PlayerAvatar } from "@/components/player-avatar";
import { normalizeName } from "@/lib/text";
import type { GameSnapshot } from "@/lib/types";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Anfrage fehlgeschlagen.");
  return body;
}

function playCountdownTone(second: number) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = second === 1 ? 880 : 600;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
  oscillator.addEventListener("ended", () => void context.close());
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [now, setNow] = useState(0);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "wrong" | "correct" | "expired">("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const lastBeep = useRef<number | null>(null);
  const lastRound = useRef(0);

  const loadSnapshot = useCallback(async (quiet = false) => {
    try {
      const data = await requestJson<GameSnapshot>(`/api/games/${code}`);
      setSnapshot(data);
      if (!quiet) setError("");
    } catch (requestError) {
      if (!quiet) setError(requestError instanceof Error ? requestError.message : "Spiel konnte nicht geladen werden.");
    }
  }, [code]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadSnapshot(), 0);
    const poll = window.setInterval(() => void loadSnapshot(true), 800);
    const clock = window.setInterval(() => setNow(Date.now()), 100);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    const round = snapshot?.game.currentRound ?? 0;
    if (round !== lastRound.current) {
      lastRound.current = round;
      setQuery("");
      setFeedback("idle");
      lastBeep.current = null;
    }
  }, [snapshot?.game.currentRound]);

  const remainingMs = snapshot?.game.roundEndsAt ? new Date(snapshot.game.roundEndsAt).getTime() - now : 0;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const isRoundLive = snapshot?.game.status === "active" && remainingMs > 0;
  const hasAnswered = Boolean(snapshot?.answers.some((answer) => answer.profileId === snapshot.me.id));
  const country = countries.find((item) => item.code === snapshot?.game.currentCountryCode);
  const progress = snapshot?.game.roundEndsAt && snapshot.game.roundStartedAt
    ? Math.max(0, Math.min(1, remainingMs / (new Date(snapshot.game.roundEndsAt).getTime() - new Date(snapshot.game.roundStartedAt).getTime())))
    : 0;

  useEffect(() => {
    if (audioOn && isRoundLive && remaining <= 3 && remaining >= 1 && lastBeep.current !== remaining) {
      lastBeep.current = remaining;
      try { playCountdownTone(remaining); } catch { /* Sound can be blocked until user interaction. */ }
    }
  }, [audioOn, isRoundLive, remaining]);

  const suggestions = useMemo(() => {
    const normalized = normalizeName(query);
    if (!normalized || normalized.length < 2) return [];
    return countries
      .filter((item) => [item.name, ...item.aliases].some((name) => normalizeName(name).includes(normalized)))
      .slice(0, 5);
  }, [query]);

  async function startRound() {
    setBusy(true);
    setError("");
    try {
      const data = await requestJson<GameSnapshot>(`/api/games/${code}/start`, { method: "POST", body: "{}" });
      setSnapshot(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Die Runde konnte nicht gestartet werden.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent, selectedCode?: string) {
    event.preventDefault();
    if (!isRoundLive || hasAnswered) return;
    const normalized = normalizeName(query);
    const match = selectedCode
      ? countries.find((item) => item.code === selectedCode)
      : countries.find((item) => [item.name, ...item.aliases].some((name) => normalizeName(name) === normalized));
    if (!match) {
      setFeedback("wrong");
      window.setTimeout(() => setFeedback("idle"), 700);
      return;
    }
    setBusy(true);
    try {
      const result = await requestJson<{ correct: boolean; expired?: boolean }>(`/api/games/${code}/answer`, {
        method: "POST",
        body: JSON.stringify({ countryCode: match.code }),
      });
      if (result.correct) {
        setFeedback("correct");
        setQuery(match.name);
        await loadSnapshot(true);
      } else {
        setFeedback(result.expired ? "expired" : "wrong");
        if (!result.expired) {
          setQuery("");
          window.setTimeout(() => setFeedback("idle"), 700);
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Antwort konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (!snapshot) {
    return (
      <main className="game-shell loading-screen">
        <div className="loader-globe"><Globe2 size={30} /></div>
        <h1>{error || "Spiel wird geladen …"}</h1>
        {error && <Link className="secondary-button" href="/"><Home size={18} /> Zur Startseite</Link>}
      </main>
    );
  }

  const winner = snapshot.players.find((player) => player.id === snapshot.game.winnerProfileId);
  const ended = snapshot.game.currentRound > 0 && !isRoundLive;

  return (
    <main className="game-shell">
      <header className="game-header">
        <Link className="brand" href="/"><span className="brand-mark"><Globe2 size={20} /></span><span>Flaggenfieber</span></Link>
        <div className="room-code" title="Spielcode kopieren">
          <span>Raum</span><strong>{code}</strong>
          <button onClick={copyCode} aria-label="Spielcode kopieren">{copied ? <Check size={17} /> : <Copy size={17} />}</button>
        </div>
        <div className="game-header-actions">
          <span className="live-pill"><i /> {snapshot.mode === "demo" ? "Demo" : "Live"}</span>
          <button className="icon-button" onClick={() => setAudioOn((value) => !value)} aria-label="Countdown-Töne umschalten"><Volume2 size={19} />{!audioOn && <b>/</b>}</button>
          <div className="header-player"><PlayerAvatar avatarId={snapshot.me.avatarId} size={31} />{snapshot.me.displayName}</div>
        </div>
      </header>

      {snapshot.game.status === "waiting" ? (
        <section className="lobby-view wrap">
          <div className="lobby-main">
            <div className="eyebrow"><Users size={14} /> Lobby ist offen</div>
            <h1>Alle an Bord?</h1>
            <p>Teile den Code mit deinen Freunden. Sobald alle in der Liste stehen, kann der Host die erste Flagge starten.</p>
            <button className="giant-code" onClick={copyCode}>
              <span>Dein Spielcode</span>
              <strong>{code}</strong>
              <small>{copied ? <><Check size={15} /> Kopiert!</> : <><Copy size={15} /> Zum Kopieren klicken</>}</small>
            </button>
            <div className="lobby-settings">
              <div><Timer size={20} /><span><b>{snapshot.game.secondsPerRound} Sekunden</b>pro Flagge</span></div>
              <div><Trophy size={20} /><span><b>{snapshot.game.targetScore} Punkte</b>bis zum Sieg</span></div>
              <div><Zap size={20} /><span><b>10 → 1 Punkte</b>nach Schnelligkeit</span></div>
            </div>
            {snapshot.isHost ? (
              <button className="primary-button lobby-start" onClick={startRound} disabled={busy || snapshot.players.length < 1}>
                <Play size={19} fill="currentColor" /> Erste Flagge starten
              </button>
            ) : (
              <div className="waiting-host"><span className="dot-loader" /> Der Host startet gleich das Spiel …</div>
            )}
          </div>
          <aside className="lobby-players panel">
            <div className="aside-title"><div><p className="section-kicker">Jetzt im Raum</p><h2>{snapshot.players.length} Spieler</h2></div><Users size={22} /></div>
            <div className="player-list">
              {snapshot.players.map((player) => (
                <div className="lobby-player" key={player.id}>
                  <PlayerAvatar avatarId={player.avatarId} size={38} className="player-avatar" />
                  <strong>{player.displayName}{player.id === snapshot.me.id && <small>Du</small>}</strong>
                  {player.id === snapshot.game.hostProfileId && <span className="host-badge"><Crown size={12} fill="currentColor" /> Host</span>}
                </div>
              ))}
            </div>
          </aside>
        </section>
      ) : snapshot.game.status === "finished" ? (
        <section className="result-view wrap">
          <div className="winner-burst"><span /><span /><span /></div>
          <div className="winner-crown"><Crown size={52} fill="currentColor" /></div>
          <p className="section-kicker">Wir haben einen Sieger</p>
          <h1>{winner?.displayName ?? "Gewonnen!"}</h1>
          <p>hat mit {winner?.score ?? snapshot.game.targetScore} Punkten die Welt erobert.</p>
          <div className="podium-list">
            {snapshot.players.slice(0, 5).map((player, index) => (
              <div className={`podium-row podium-${index + 1}`} key={player.id}>
                <span className="rank-number">{index + 1}</span>
                <PlayerAvatar avatarId={player.avatarId} size={38} className="player-avatar" />
                <strong>{player.displayName}</strong>
                <b>{player.score} Pkt.</b>
              </div>
            ))}
          </div>
          <Link className="primary-button" href="/"><Home size={18} /> Zurück zur Startseite</Link>
        </section>
      ) : (
        <section className="quiz-layout">
          <aside className="score-sidebar">
            <div className="aside-title"><div><p className="section-kicker">Rangliste</p><h2>Spielstand</h2></div><Trophy size={22} /></div>
            <div className="score-list">
              {snapshot.players.map((player, index) => (
                <div className={`score-player ${player.id === snapshot.me.id ? "is-me" : ""}`} key={player.id}>
                  <span className="score-rank">{index === 0 ? <Crown size={17} fill="currentColor" /> : index + 1}</span>
                  <PlayerAvatar avatarId={player.avatarId} size={38} className="player-avatar" />
                  <span className="score-name">{player.displayName}<small>{player.id === snapshot.me.id ? "Du" : ""}</small></span>
                  <strong>{player.score}</strong>
                </div>
              ))}
            </div>
            <div className="target-progress">
              <span><Flag size={15} /> Ziel: {snapshot.game.targetScore}</span>
              <div><i style={{ width: `${Math.min(100, (snapshot.players[0]?.score ?? 0) / snapshot.game.targetScore * 100)}%` }} /></div>
            </div>
          </aside>

          <section className="quiz-stage">
            <div className="round-meta"><span>Runde {snapshot.game.currentRound}</span><span>•</span><span>193 UN-Länder</span></div>
            <div className={`timer-ring ${remaining <= 3 && isRoundLive ? "urgent" : ""}`} style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}>
              <div><strong>{remaining}</strong><small>Sek.</small></div>
            </div>
            <div className={`quiz-flag ${ended ? "revealed" : ""}`}>
              {country && <Image src={country.flag} alt={ended ? `Flagge von ${country.name}` : "Zu erratende Länderflagge"} width={480} height={320} priority unoptimized />}
            </div>

            {ended ? (
              <div className="reveal-box">
                <p>Das war</p>
                <h1>{country?.name}</h1>
                {snapshot.isHost ? (
                  <button className="primary-button" onClick={startRound} disabled={busy}><Play size={18} fill="currentColor" /> Nächste Flagge</button>
                ) : (
                  <span className="waiting-host"><span className="dot-loader" /> Warte auf den Host …</span>
                )}
              </div>
            ) : hasAnswered || feedback === "correct" ? (
              <div className="correct-box"><span><Check size={22} strokeWidth={3} /></span><div><strong>Richtig!</strong><small>Deine Antwort ist drin.</small></div></div>
            ) : (
              <form className={`answer-form ${feedback === "wrong" ? "shake" : ""}`} onSubmit={submit}>
                <label htmlFor="country">Welches Land ist das?</label>
                <div className="answer-input-row">
                  <input id="country" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Land eintippen …" autoComplete="off" autoFocus />
                  <button disabled={busy || !query.trim()} aria-label="Antwort absenden"><ArrowLeft size={20} /></button>
                </div>
                {suggestions.length > 0 && (
                  <div className="suggestions">
                    {suggestions.map((item) => <button type="button" key={item.code} onClick={(event) => { setQuery(item.name); void submit(event, item.code); }}>{item.name}</button>)}
                  </div>
                )}
                <p className={feedback === "wrong" ? "wrong-text visible" : "wrong-text"}>Noch nicht – versuch es weiter!</p>
              </form>
            )}
            {error && <p className="error-banner compact" role="alert">{error}</p>}
          </section>

          <aside className="answers-sidebar">
            <div className="aside-title"><div><p className="section-kicker">Diese Runde</p><h2>Schon erkannt</h2></div><Medal size={22} /></div>
            {snapshot.answers.length ? (
              <div className="answer-list">
                {snapshot.answers.map((answer) => (
                  <div className="answer-player" key={answer.profileId}>
                    <span className={`answer-rank rank-${answer.rank}`}>{answer.rank}</span>
                    <PlayerAvatar avatarId={answer.avatarId} size={36} className="player-avatar" />
                    <strong>{answer.displayName}</strong>
                    <b>+{answer.points}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-answers"><Zap size={27} /><strong>Noch niemand</strong><span>Wer ist zuerst?</span></div>
            )}
            <div className="points-legend"><span>1.</span><b>10</b><span>2.</span><b>9</b><span>3.</span><b>8</b><small>danach weiter absteigend</small></div>
          </aside>
        </section>
      )}
    </main>
  );
}
