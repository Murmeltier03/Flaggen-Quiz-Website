"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
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
import type { AnswerSubmissionResult, GameSnapshot, RoundAnswer } from "@/lib/types";

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

function playTone(
  context: AudioContext,
  frequency: number,
  startsIn: number,
  duration: number,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  const start = context.currentTime + startsIn;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playCountdownTone(context: AudioContext, second: number) {
  playTone(context, second === 1 ? 880 : 600, 0, 0.16, 0.14);
}

function playTeammateTone(context: AudioContext) {
  playTone(context, 660, 0, 0.14, 0.09);
  playTone(context, 880, 0.11, 0.2, 0.11);
}

function formatReaction(reactionMs: number) {
  return (reactionMs / 1000).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " s";
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
  const [teammateNotice, setTeammateNotice] = useState<RoundAnswer | null>(null);
  const lastBeep = useRef<number | null>(null);
  const lastRound = useRef(0);
  const autoAdvanceRound = useRef<number | null>(null);
  const serverOffset = useRef(0);
  const pollInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const pollDelay = useRef(500);
  const audioContext = useRef<AudioContext | null>(null);
  const seenAnswerKeys = useRef(new Set<string>());
  const seenAnswersRound = useRef<number | null>(null);
  const answersInitialized = useRef(false);
  const currentRoundRef = useRef(0);
  const answerRequestInFlight = useRef(false);
  const answerInput = useRef<HTMLInputElement | null>(null);

  const ensureAudioContext = useCallback(async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext.current || audioContext.current.state === "closed") {
      audioContext.current = new AudioContextClass();
    }
    if (audioContext.current.state === "suspended") {
      await audioContext.current.resume();
    }
    return audioContext.current;
  }, []);

  const applySnapshot = useCallback((data: GameSnapshot) => {
    const offset = new Date(data.serverTime).getTime() - Date.now();
    serverOffset.current = offset;
    setNow(Date.now() + offset);
    setSnapshot((current) => {
      if (!current) return data;
      if (data.game.currentRound < current.game.currentRound) return current;
      if (current.game.status === "finished" && data.game.status !== "finished") return current;
      if (data.game.currentRound !== current.game.currentRound) return data;

      const answerMap = new Map(data.answers.map((answer) => [answer.profileId, answer]));
      for (const answer of current.answers) {
        if (!answerMap.has(answer.profileId)) answerMap.set(answer.profileId, answer);
      }
      const scoreByPlayer = new Map(current.players.map((player) => [player.id, player.score]));
      return {
        ...data,
        players: data.players.map((player) => ({
          ...player,
          score: Math.max(player.score, scoreByPlayer.get(player.id) ?? 0),
        })).sort((left, right) => right.score - left.score || left.joinedAt.localeCompare(right.joinedAt)),
        answers: [...answerMap.values()].sort((left, right) => left.rank - right.rank),
      };
    });
  }, []);

  const loadSnapshot = useCallback(async (quiet = false) => {
    if (pollInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    pollInFlight.current = true;
    try {
      let nextRequestIsQuiet = quiet;
      do {
        refreshQueued.current = false;
        try {
          const data = await requestJson<GameSnapshot>("/api/games/" + code);
          applySnapshot(data);
          if (!nextRequestIsQuiet) setError("");
        } catch (requestError) {
          if (!nextRequestIsQuiet) {
            setError(requestError instanceof Error ? requestError.message : "Spiel konnte nicht geladen werden.");
          }
        }
        nextRequestIsQuiet = true;
      } while (refreshQueued.current);
    } finally {
      pollInFlight.current = false;
    }
  }, [applySnapshot, code]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = 0;
    const poll = async (quiet: boolean) => {
      await loadSnapshot(quiet);
      if (!cancelled) pollTimer = window.setTimeout(() => void poll(true), pollDelay.current);
    };
    void poll(false);
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    pollDelay.current = snapshot?.game.status === "active"
      ? 320
      : snapshot?.game.status === "waiting"
        ? 650
        : 1600;
  }, [snapshot?.game.status]);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioOn) void ensureAudioContext().catch(() => null);
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [audioOn, ensureAudioContext]);

  useEffect(() => () => {
    const context = audioContext.current;
    audioContext.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now() + serverOffset.current), 100);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const round = snapshot?.game.currentRound ?? 0;
    currentRoundRef.current = round;
    if (round !== lastRound.current) {
      lastRound.current = round;
      autoAdvanceRound.current = null;
      setQuery("");
      setFeedback("idle");
      lastBeep.current = null;
      window.requestAnimationFrame(() => answerInput.current?.focus({ preventScroll: true }));
    }
  }, [snapshot?.game.currentRound]);

  useEffect(() => {
    if (!snapshot) return;
    const round = snapshot.game.currentRound;
    const currentKeys = new Set(snapshot.answers.map((answer) => `${round}:${answer.profileId}`));
    if (!answersInitialized.current) {
      answersInitialized.current = true;
      seenAnswersRound.current = round;
      seenAnswerKeys.current = currentKeys;
      return;
    }
    if (seenAnswersRound.current !== round) {
      seenAnswersRound.current = round;
      seenAnswerKeys.current = new Set();
      setTeammateNotice(null);
    }

    const newTeammateAnswers = snapshot.answers.filter((answer) => (
      answer.profileId !== snapshot.me.id
      && !seenAnswerKeys.current.has(`${round}:${answer.profileId}`)
    ));
    seenAnswerKeys.current = currentKeys;
    if (!newTeammateAnswers.length) return;

    setTeammateNotice(newTeammateAnswers.at(-1) ?? null);
    if (audioOn) {
      void ensureAudioContext()
        .then((context) => {
          if (context) playTeammateTone(context);
        })
        .catch(() => undefined);
    }
  }, [audioOn, ensureAudioContext, snapshot]);

  useEffect(() => {
    if (!teammateNotice) return;
    const timer = window.setTimeout(() => setTeammateNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [teammateNotice]);

  const remainingMs = snapshot?.game.roundEndsAt ? new Date(snapshot.game.roundEndsAt).getTime() - now : 0;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const isRoundLive = snapshot?.game.status === "active" && remainingMs > 0;
  const myAnswer = snapshot?.answers.find((answer) => answer.profileId === snapshot.me.id);
  const hasAnswered = Boolean(myAnswer);
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
      void ensureAudioContext()
        .then((context) => {
          if (context) playCountdownTone(context, remaining);
        })
        .catch(() => undefined);
    }
  }, [audioOn, ensureAudioContext, isRoundLive, remaining]);

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isRoundLive || hasAnswered || !snapshot || busy || answerRequestInFlight.current) return;
    const submittedRound = snapshot.game.currentRound;
    const normalized = normalizeName(query);
    const match = countries.find((item) => (
      [item.name, ...item.aliases].some((name) => normalizeName(name) === normalized)
    ));
    if (!match) {
      setFeedback("wrong");
      window.setTimeout(() => setFeedback("idle"), 700);
      return;
    }
    answerRequestInFlight.current = true;
    setBusy(true);
    try {
      if (audioOn) void ensureAudioContext().catch(() => null);
      const result = await requestJson<AnswerSubmissionResult>("/api/games/" + code + "/answer", {
        method: "POST",
        body: JSON.stringify({ countryCode: match.code }),
      });
      const resultTime = new Date(result.serverTime).getTime();
      if (Number.isFinite(resultTime)) {
        serverOffset.current = resultTime - Date.now();
        setNow(resultTime);
      }
      if (currentRoundRef.current !== submittedRound) {
        void loadSnapshot(true);
        return;
      }
      if (result.correct) {
        setFeedback("correct");
        setQuery(match.name);
        const acceptedAnswer = result.answer;
        if (acceptedAnswer) {
          setSnapshot((current) => {
            if (!current || current.game.currentRound !== submittedRound) return current;
            const answers = current.answers.some((answer) => answer.profileId === acceptedAnswer.profileId)
              ? current.answers
              : [...current.answers, acceptedAnswer].sort((left, right) => left.rank - right.rank);
            const players = current.players
              .map((player) => player.id === current.me.id && result.playerScore !== null
                ? { ...player, score: Math.max(player.score, result.playerScore) }
                : player)
              .sort((left, right) => right.score - left.score || left.joinedAt.localeCompare(right.joinedAt));
            return {
              ...current,
              serverTime: result.serverTime,
              game: {
                ...current.game,
                status: result.gameStatus ?? current.game.status,
                winnerProfileId: result.winnerProfileId ?? current.game.winnerProfileId,
              },
              players,
              answers,
            };
          });
        }
        void loadSnapshot(true);
      } else {
        setFeedback(result.expired ? "expired" : "wrong");
        if (!result.expired) {
          setQuery("");
          window.setTimeout(() => setFeedback("idle"), 700);
        }
      }
    } catch (requestError) {
      if (currentRoundRef.current === submittedRound) {
        setError(requestError instanceof Error ? requestError.message : "Antwort konnte nicht gesendet werden.");
      }
    } finally {
      answerRequestInFlight.current = false;
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

  async function toggleAudio() {
    const nextValue = !audioOn;
    setAudioOn(nextValue);
    if (nextValue) {
      await ensureAudioContext().catch(() => null);
    } else if (audioContext.current?.state === "running") {
      await audioContext.current.suspend().catch(() => undefined);
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
            onClick={() => void toggleAudio()}
            aria-label={audioOn ? "Quiz-Töne ausschalten" : "Quiz-Töne einschalten"}
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

      {teammateNotice && (
        <div className="teammate-toast glass-panel" role="status">
          <PlayerAvatar avatarId={teammateNotice.avatarId} size={34} />
          <span>
            <strong>{teammateNotice.displayName} hat’s erkannt</strong>
            <small>#{teammateNotice.rank} · {formatReaction(teammateNotice.reactionMs)} · {teammateNotice.speedPercent}%</small>
          </span>
          <Check size={17} strokeWidth={2.7} />
        </div>
      )}

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
                <div>
                  <strong>Richtig{myAnswer ? ` · +${myAnswer.points}` : ""}</strong>
                  <small>{myAnswer
                    ? `#${myAnswer.rank} · ${formatReaction(myAnswer.reactionMs)} · ${myAnswer.speedPercent}% Tempo`
                    : "Deine Antwort wird bestätigt."}</small>
                </div>
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
                  />
                  <button disabled={busy || !query.trim()} aria-label="Antwort absenden"><ArrowRight size={20} /></button>
                </div>
                <p
                  className={"wrong-text " + (feedback === "wrong" || feedback === "expired" ? "visible" : "")}
                  aria-live="polite"
                >
                  {feedback === "expired" ? "Die Zeit ist abgelaufen." : "Noch nicht – versuch es weiter."}
                </p>
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
                    <span className={"answer-rank rank-" + answer.rank}>#{answer.rank}</span>
                    <PlayerAvatar avatarId={answer.avatarId} size={36} className="player-avatar" />
                    <span className="answer-copy">
                      <strong>{answer.displayName}</strong>
                      <small>{formatReaction(answer.reactionMs)} · {answer.speedPercent}% · +{answer.points}</small>
                    </span>
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
