"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  Crown,
  Flag,
  Globe2,
  Home,
  Medal,
  Play,
  Timer,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import countries from "@/data/countries.json";
import { PlayerAvatar } from "@/components/player-avatar";
import { normalizeName } from "@/lib/text";
import type { GameSnapshot } from "@/lib/types";

const AUTO_ADVANCE_DELAY_MS = 2600;

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
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.01);
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
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "wrong" | "correct" | "expired">("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const lastBeep = useRef<number | null>(null);
  const lastRound = useRef(0);
  const autoAdvanceRound = useRef<number | null>(null);
  const serverOffset = useRef(0);
  const pollInFlight = useRef(false);
  const answerInput = useRef<HTMLInputElement | null>(null);

  const applySnapshot = useCallback((data: GameSnapshot) => {
    const offset = new Date(data.serverTime).getTime() - Date.now();
    serverOffset.current = offset;
    setNow(Date.now() + offset);
    setSnapshot((current) => {
      if (!current) return data;
      if (data.game.currentRound < current.game.currentRound) return current;
      if (current.game.status === "finished" && data.game.status !== "finished") return current;
      return data;
    });
  }, []);

  const loadSnapshot = useCallback(async (quiet = false) => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const data = await requestJson<GameSnapshot>("/api/games/" + code);
      applySnapshot(data);
      if (!quiet) setError("");
    } catch (requestError) {
      if (!quiet) setError(requestError instanceof Error ? requestError.message : "Spiel konnte nicht geladen werden.");
    } finally {
      pollInFlight.current = false;
    }
  }, [applySnapshot, code]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = 0;
    const poll = async (quiet: boolean) => {
      await loadSnapshot(quiet);
      if (!cancelled) pollTimer = window.setTimeout(() => void poll(true), 800);
    };
    void poll(false);
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now() + serverOffset.current), 100);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const round = snapshot?.game.currentRound ?? 0;
    if (round !== lastRound.current) {
      lastRound.current = round;
      autoAdvanceRound.current = null;
      setQuery("");
      setFeedback("idle");
      lastBeep.current = null;
      window.requestAnimationFrame(() => answerInput.current?.focus());
    }
  }, [snapshot?.game.currentRound]);

  const remainingMs = snapshot?.game.roundEndsAt ? new Date(snapshot.game.roundEndsAt).getTime() - now : 0;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const isRoundLive = snapshot?.game.status === "active" && remainingMs > 0;
  const hasAnswered = Boolean(snapshot?.answers.some((answer) => answer.profileId === snapshot.me.id));
  const country = countries.find((item) => item.code === snapshot?.game.currentCountryCode);
  const progress = snapshot?.game.roundEndsAt && snapshot.game.roundStartedAt
    ? Math.max(
      0,
      Math.min(
        1,
        remainingMs / (new Date(snapshot.game.roundEndsAt).getTime() - new Date(snapshot.game.roundStartedAt).getTime()),
      ),
    )
    : 0;
  const ended = Boolean(snapshot && snapshot.game.currentRound > 0 && snapshot.game.status === "active" && !isRoundLive);
  const revealRemaining = snapshot?.game.roundEndsAt
    ? Math.max(0, Math.ceil((new Date(snapshot.game.roundEndsAt).getTime() + AUTO_ADVANCE_DELAY_MS - now) / 1000))
    : 0;

  useEffect(() => {
    if (audioOn && isRoundLive && remaining <= 3 && remaining >= 1 && lastBeep.current !== remaining) {
      lastBeep.current = remaining;
      try {
        playCountdownTone(remaining);
      } catch {
        // Browser may block sound until the first interaction.
      }
    }
  }, [audioOn, isRoundLive, remaining]);

  const startRound = useCallback(async (expectedRound: number, automatic = false) => {
    if (!automatic) {
      setBusy(true);
      setError("");
    }
    try {
      const data = await requestJson<GameSnapshot>("/api/games/" + code + "/start", {
        method: "POST",
        body: JSON.stringify({ expectedRound }),
      });
      applySnapshot(data);
    } catch (requestError) {
      if (automatic) {
        await loadSnapshot(true);
      } else {
        setError(requestError instanceof Error ? requestError.message : "Die Runde konnte nicht gestartet werden.");
      }
    } finally {
      if (!automatic) setBusy(false);
    }
  }, [applySnapshot, code, loadSnapshot]);

  useEffect(() => {
    if (
      !snapshot?.isHost
      || snapshot.game.status !== "active"
      || snapshot.game.currentRound < 1
      || isRoundLive
      || !snapshot.game.roundEndsAt
    ) return;

    const round = snapshot.game.currentRound;
    if (autoAdvanceRound.current === round) return;
    const advanceAt = new Date(snapshot.game.roundEndsAt).getTime() + AUTO_ADVANCE_DELAY_MS;
    const delay = Math.max(0, advanceAt - (Date.now() + serverOffset.current));
    const timer = window.setTimeout(() => {
      if (autoAdvanceRound.current === round) return;
      autoAdvanceRound.current = round;
      void startRound(round, true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    isRoundLive,
    snapshot?.game.currentRound,
    snapshot?.game.roundEndsAt,
    snapshot?.game.status,
    snapshot?.isHost,
    startRound,
  ]);

  const suggestions = useMemo(() => {
    const normalized = normalizeName(query);
    if (!normalized || normalized.length < 2) return [];
    return countries
      .filter((item) => [item.name, ...item.aliases].some((name) => normalizeName(name).includes(normalized)))
      .slice(0, 5);
  }, [query]);

  async function submit(event: React.FormEvent, selectedCode?: string) {
    event.preventDefault();
    if (!isRoundLive || hasAnswered || !snapshot) return;
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
      const result = await requestJson<{ correct: boolean; expired?: boolean }>("/api/games/" + code + "/answer", {
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
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Der Spielcode konnte nicht kopiert werden.");
    }
  }

  if (!snapshot) {
    return (
      <main className="game-shell loading-screen">
        <div className="loader-globe"><Globe2 size={28} /></div>
        <h1>{error || "Spiel wird geladen …"}</h1>
        {error && <Link className="secondary-button" href="/"><Home size={18} /> Zur Startseite</Link>}
      </main>
    );
  }

  const winner = snapshot.players.find((player) => player.id === snapshot.game.winnerProfileId);

  return (
    <main className="game-shell">
      <div className="game-orb game-orb-one" aria-hidden="true" />
      <div className="game-orb game-orb-two" aria-hidden="true" />

      <header className="game-header">
        <Link className="brand" href="/">
          <span className="brand-mark"><Globe2 size={19} /></span>
          <span>Flaggenfieber</span>
        </Link>
        <button className="room-code" onClick={copyCode} title="Spielcode kopieren">
          <span>Raum</span><strong>{code}</strong>
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
        <div className="game-header-actions">
          <button
            className="icon-button"
            onClick={() => setAudioOn((value) => !value)}
            aria-label={audioOn ? "Countdown-Töne ausschalten" : "Countdown-Töne einschalten"}
            aria-pressed={audioOn}
          >
            {audioOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <div className="header-player">
            <PlayerAvatar avatarId={snapshot.me.avatarId} size={32} />
            <span>{snapshot.me.displayName}</span>
          </div>
        </div>
      </header>

      {snapshot.game.status === "waiting" ? (
        <section className="lobby-view wrap">
          <div className="lobby-main glass-panel">
            <span className="eyebrow"><i /> Raum ist bereit</span>
            <h1>Freunde einladen.<br />Dann geht’s los.</h1>
            <p>Teile den Code. Neue Spieler erscheinen automatisch in der Liste.</p>
            <button className="giant-code" onClick={copyCode}>
              <span>Spielcode</span>
              <strong>{code}</strong>
              <small>{copied ? <><Check size={15} /> Kopiert</> : <><Copy size={15} /> Code kopieren</>}</small>
            </button>
            <div className="lobby-settings">
              <div><Timer size={18} /><span><b>{snapshot.game.secondsPerRound} Sek.</b>pro Flagge</span></div>
              <div><Trophy size={18} /><span><b>{snapshot.game.targetScore}</b>Punkte zum Sieg</span></div>
            </div>
            {snapshot.isHost ? (
              <button
                className="primary-button lobby-start"
                onClick={() => void startRound(snapshot.game.currentRound)}
                disabled={busy || snapshot.players.length < 1}
              >
                <Play size={18} fill="currentColor" /> Spiel starten
              </button>
            ) : (
              <div className="waiting-host"><span className="dot-loader" /> Der Host startet das Spiel.</div>
            )}
          </div>

          <aside className="lobby-players glass-panel">
            <div className="aside-title">
              <div><small>Im Raum</small><h2>{snapshot.players.length} Spieler</h2></div>
              <Users size={21} />
            </div>
            <div className="player-list">
              {snapshot.players.map((player) => (
                <div className="lobby-player" key={player.id}>
                  <PlayerAvatar avatarId={player.avatarId} size={40} className="player-avatar" />
                  <strong>{player.displayName}{player.id === snapshot.me.id && <small>Du</small>}</strong>
                  {player.id === snapshot.game.hostProfileId && <span className="host-badge"><Crown size={12} fill="currentColor" /> Host</span>}
                </div>
              ))}
            </div>
          </aside>
        </section>
      ) : snapshot.game.status === "finished" ? (
        <section className="result-view glass-panel wrap">
          <div className="winner-crown"><Crown size={46} fill="currentColor" /></div>
          <span className="eyebrow"><i /> Spiel beendet</span>
          <h1>{winner?.displayName ?? "Gewonnen!"}</h1>
          <p>gewinnt mit {winner?.score ?? snapshot.game.targetScore} Punkten.</p>
          <div className="podium-list">
            {snapshot.players.slice(0, 5).map((player, index) => (
              <div className={"podium-row podium-" + (index + 1)} key={player.id}>
                <span className="rank-number">{index + 1}</span>
                <PlayerAvatar avatarId={player.avatarId} size={38} className="player-avatar" />
                <strong>{player.displayName}</strong>
                <b>{player.score}</b>
              </div>
            ))}
          </div>
          <Link className="primary-button" href="/"><Home size={18} /> Zur Startseite</Link>
        </section>
      ) : (
        <section className="quiz-layout">
          <aside className="score-sidebar glass-panel">
            <div className="aside-title">
              <div><small>Gesamt</small><h2>Spielstand</h2></div>
              <Trophy size={21} />
            </div>
            <div className="score-list">
              {snapshot.players.map((player, index) => (
                <div className={"score-player " + (player.id === snapshot.me.id ? "is-me" : "")} key={player.id}>
                  <span className="score-rank">{index === 0 ? <Crown size={16} fill="currentColor" /> : index + 1}</span>
                  <PlayerAvatar avatarId={player.avatarId} size={38} className="player-avatar" />
                  <span className="score-name">{player.displayName}{player.id === snapshot.me.id && <small>Du</small>}</span>
                  <strong>{player.score}</strong>
                </div>
              ))}
            </div>
            <div className="target-progress">
              <span><Flag size={15} /> Ziel {snapshot.game.targetScore}</span>
              <div><i style={{ width: Math.min(100, (snapshot.players[0]?.score ?? 0) / snapshot.game.targetScore * 100) + "%" }} /></div>
            </div>
          </aside>

          <section className="quiz-stage glass-panel">
            <div
              className={"timer-ring " + (remaining <= 3 && isRoundLive ? "urgent" : "")}
              style={{ "--progress": progress * 360 + "deg" } as React.CSSProperties}
              aria-label={remaining + " Sekunden verbleibend"}
            >
              <div><strong>{remaining}</strong><small>Sek.</small></div>
            </div>

            <div className={"quiz-flag " + (ended ? "revealed" : "")}>
              {country && (
                <div className="flag-image-frame">
                  <Image
                    src={country.flag}
                    alt={ended ? "Flagge von " + country.name : "Zu erratende Länderflagge"}
                    fill
                    sizes="(max-width: 680px) 82vw, 360px"
                    priority
                    unoptimized
                  />
                </div>
              )}
            </div>

            {ended ? (
              <div className="reveal-box" aria-live="polite">
                <small>Das war</small>
                <h1>{country?.name}</h1>
                <span className="next-round-status">
                  <span className="dot-loader" />
                  {snapshot.isHost
                    ? revealRemaining > 0
                      ? "Nächste Flagge in " + revealRemaining
                      : "Nächste Flagge wird geladen"
                    : "Nächste Flagge kommt gleich"}
                </span>
              </div>
            ) : hasAnswered || feedback === "correct" ? (
              <div className="correct-box" aria-live="polite">
                <span><Check size={21} strokeWidth={3} /></span>
                <div><strong>Richtig</strong><small>Deine Antwort ist drin.</small></div>
              </div>
            ) : (
              <form className={"answer-form " + (feedback === "wrong" ? "shake" : "")} onSubmit={submit}>
                <label htmlFor="country">Land eingeben</label>
                <div className="answer-input-row">
                  <input
                    ref={answerInput}
                    id="country"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Welches Land ist das?"
                    autoComplete="off"
                    autoFocus
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={suggestions.length > 0}
                    aria-controls="country-suggestions"
                  />
                  <button disabled={busy || !query.trim()} aria-label="Antwort absenden"><ArrowRight size={20} /></button>
                </div>
                {suggestions.length > 0 && (
                  <div className="suggestions" id="country-suggestions" role="listbox">
                    {suggestions.map((item) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected="false"
                        key={item.code}
                        onClick={(event) => {
                          setQuery(item.name);
                          void submit(event, item.code);
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className={"wrong-text " + (feedback === "wrong" ? "visible" : "")} aria-live="polite">Noch nicht – versuch es weiter.</p>
              </form>
            )}
            {error && <p className="error-banner compact" role="alert">{error}</p>}
          </section>

          <aside className="answers-sidebar glass-panel">
            <div className="aside-title">
              <div><small>Aktuelle Flagge</small><h2>Schon erkannt</h2></div>
              <Medal size={21} />
            </div>
            {snapshot.answers.length ? (
              <div className="answer-list">
                {snapshot.answers.map((answer) => (
                  <div className="answer-player" key={answer.profileId}>
                    <span className={"answer-rank rank-" + answer.rank}>{answer.rank}</span>
                    <PlayerAvatar avatarId={answer.avatarId} size={36} className="player-avatar" />
                    <strong>{answer.displayName}</strong>
                    <Check size={17} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-answers"><Medal size={25} /><strong>Noch niemand</strong><span>Sei der Erste.</span></div>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
