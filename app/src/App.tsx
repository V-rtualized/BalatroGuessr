import { useState, useEffect, useRef } from "react";

const MAX_ATTEMPTS = 3;
const VERSION = 2;
const COOKIE_KEY = `bg_state_${VERSION}`;

type Guess = {
  ante: number;
  stake: string;
  deck: string;
  blind: string;
  fields: { ante: boolean; stake: boolean; deck: boolean; blind: boolean };
  correct: boolean;
};

type GameState = {
  status: "playing" | "won" | "lost";
  guesses: Guess[];
  answer?: { ante: number; stake: string; deck: string; blind: string };
};

const STAKES = ["White", "Green", "Purple"];
const DECKS = ["Normal", "Plasma"];
const BLINDS: { name: string; desc?: string }[] = [
  { name: "Small Blind" },
  { name: "Big Blind" },
  { name: "The Hook", desc: "Discards 2 random cards per hand" },
  { name: "The Ox", desc: "Playing a #1 most played hand sets money to $0" },
  { name: "The House", desc: "First hand is drawn face down" },
  { name: "The Wall", desc: "Extra large blind" },
  { name: "The Wheel", desc: "1 in 7 cards drawn face down" },
  { name: "The Arm", desc: "Lowers level of played poker hand" },
  { name: "The Club", desc: "All Club cards are debuffed" },
  { name: "The Fish", desc: "Cards drawn face down after each hand" },
  { name: "The Psychic", desc: "Must play 5 cards" },
  { name: "The Goad", desc: "All Spade cards are debuffed" },
  { name: "The Water", desc: "Start with 0 discards" },
  { name: "The Window", desc: "All Diamond cards are debuffed" },
  { name: "The Manacle", desc: "-1 hand size" },
  { name: "The Eye", desc: "No repeat hand types this round" },
  { name: "The Mouth", desc: "Play only 1 hand type this round" },
  { name: "The Plant", desc: "All face cards are debuffed" },
  { name: "The Serpent", desc: "After Play or Discard, always draw 3 cards" },
  { name: "The Pillar", desc: "Cards played previously this Ante are debuffed" },
  { name: "The Needle", desc: "Play only 1 hand" },
  { name: "The Head", desc: "All Heart cards are debuffed" },
  { name: "The Tooth", desc: "Lose $1 per card played" },
  { name: "The Flint", desc: "Base Chips and Mult are halved" },
  { name: "The Mark", desc: "All face cards are drawn face down" },
  { name: "Amber Acorn", desc: "Flips and shuffles all Joker cards" },
  { name: "Verdant Leaf", desc: "All cards are debuffed" },
  { name: "Violet Vessel", desc: "Very large blind" },
  { name: "Crimson Heart", desc: "One random Joker disabled every hand" },
  { name: "Cerulean Bell", desc: "Forces 1 card to always be selected" },
];

const STAKE_ICONS: Record<string, string> = {
  White: "/white_stake.png",
  Green: "/green_stake.png",
  Purple: "/purple_stake.png",
};

const DECK_ICONS: Record<string, string> = {
  Normal: "/normal_deck.png",
  Plasma: "/plasma_deck.png",
};

function blindIconPath(name: string): string {
  return `/blinds/${name.replace(/ /g, "_").toLowerCase()}.png`;
}

function loadState(dateKey: string): GameState | null {
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_KEY}=`));
    if (!raw) return null;
    const data = JSON.parse(decodeURIComponent(raw.split("=")[1]));
    return data.date === dateKey ? data.state : null;
  } catch {
    return null;
  }
}

function saveState(dateKey: string, state: GameState) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 1);
  expires.setHours(23, 59, 59, 999);
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify({ date: dateKey, state }))};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function Dropdown<T extends string | number>({
  items, value, onChange, disabled, renderItem, renderSelected, minWidth,
}: {
  items: T[]; value: T; onChange: (v: T) => void; disabled?: boolean;
  renderItem: (item: T, selected: boolean) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode; minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="dropdown" ref={ref} style={{ minWidth }}>
      <button
        className="dropdown-trigger pixel-corners-sm"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        type="button"
      >
        {renderSelected(value)}
        <span className="arrow">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && (
        <div className="dropdown-menu">
          {items.map((item, i) => (
            <div
              key={i}
              className={`dropdown-item${item === value ? " selected" : ""}`}
              onClick={() => { onChange(item); setOpen(false); }}
            >
              {renderItem(item, item === value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Icon({ src }: { src: string }) {
  return <img className="icon" src={src} alt="" />;
}

// Shared tile component for guesses and answer
function Tile({ label, icon, bg, color }: { label: string; icon?: string; bg: string; color: string }) {
  return (
    <span
      className="pixel-corners-sm"
      style={{
        padding: "6px 14px",
        fontSize: 22,
        background: bg,
        color,
        textShadow: "0 1.5px 0 rgba(0,0,0,0.4)",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon && <img className="icon" src={icon} alt="" style={{ height: 22, width: "auto", imageRendering: "pixelated" }} />}
      {label}
    </span>
  );
}

function GuessTile({ label, correct, icon }: { label: string; correct: boolean; icon?: string }) {
  return (
    <Tile
      label={label}
      icon={icon}
      bg={correct ? "var(--bal-correct)" : "var(--bal-gray)"}
      color={correct ? "#fff" : "var(--bal-light-gray-text)"}
    />
  );
}

function GuessRow({ guess }: { guess: Guess }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
      <GuessTile label={`Ante ${guess.ante}`} correct={guess.fields.ante} />
      <GuessTile label={guess.stake} correct={guess.fields.stake} icon={STAKE_ICONS[guess.stake]} />
      <GuessTile label={guess.deck} correct={guess.fields.deck} icon={DECK_ICONS[guess.deck]} />
      <GuessTile label={guess.blind} correct={guess.fields.blind} icon={blindIconPath(guess.blind)} />
    </div>
  );
}

function AnswerRow({ answer }: { answer: { ante: number; stake: string; deck: string; blind: string } }) {
  const bg = "rgba(0,0,0,0.45)";
  const color = "rgba(255,255,255,0.85)";
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
      <Tile label={`Ante ${answer.ante}`} bg={bg} color={color} />
      <Tile label={answer.stake} bg={bg} color={color} icon={STAKE_ICONS[answer.stake]} />
      <Tile label={answer.deck} bg={bg} color={color} icon={DECK_ICONS[answer.deck]} />
      <Tile label={answer.blind} bg={bg} color={color} icon={blindIconPath(answer.blind)} />
    </div>
  );
}

export default function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [puzzleUuid, setPuzzleUuid] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({ status: "playing", guesses: [] });
  const [ante, setAnte] = useState(1);
  const [stake, setStake] = useState("White");
  const [deck, setDeck] = useState("Normal");
  const [blind, setBlind] = useState("Small Blind");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/daily")
      .then((r) => r.json())
      .then((data: { uuid: string; imageUrl: string; date: string }) => {
        setPuzzleUuid(data.uuid);
        setImageUrl(data.imageUrl);
        setDateKey(data.date);

        const saved = loadState(data.date);
        if (saved) setGameState(saved);
      });
  }, []);

  async function handleSubmit() {
    if (!puzzleUuid || !dateKey || gameState.status !== "playing") return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: puzzleUuid, ante, stake, deck, blind }),
      });
      const result = await res.json();

      const newGuess: Guess = {
        ante, stake, deck, blind,
        fields: result.fields,
        correct: result.correct,
      };

      const guesses = [...gameState.guesses, newGuess];
      const attemptsLeft = MAX_ATTEMPTS - guesses.length;

      let status: GameState["status"] = "playing";
      let answer: GameState["answer"];

      if (result.correct) {
        status = "won";
      } else if (attemptsLeft <= 0) {
        status = "lost";
      }

      // Fetch answer when game ends
      if (status !== "playing") {
        const answerRes = await fetch("/api/answer");
        const answerData = await answerRes.json();
        answer = answerData.answer;
      }

      const newState: GameState = { status, guesses, answer };
      setGameState(newState);
      saveState(dateKey, newState);
    } finally {
      setSubmitting(false);
    }
  }

  if (!imageUrl) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--bal-light-gray)", fontSize: 32,
      }}>
        Loading...
      </div>
    );
  }

  const done = gameState.status !== "playing";
  const antes = Array.from({ length: 12 }, (_, i) => i + 1);
  const attemptsLeft = MAX_ATTEMPTS - gameState.guesses.length;

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#000" }}>
      <img
        src={imageUrl}
        alt="Blind score"
        onLoad={() => setImgLoaded(true)}
        style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          objectFit: "cover", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.3s",
        }}
      />

      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 16, padding: "18px 24px 24px",
        background: "linear-gradient(180deg, rgba(23,37,84,0.92) 0%, rgba(23,37,84,0.85) 100%)",
        backdropFilter: "blur(10px)",
        borderBottom: "3px solid var(--bal-gray)",
      }}>
        {/* Title + date + attempts */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            <h1
              className="text-shadow-big"
              style={{
                color: "var(--bal-yellow)",
                margin: 0, fontSize: 52, letterSpacing: 6,
                textTransform: "uppercase",
              }}
            >
              Balatro Guessr
            </h1>
            {!done && (
              <span className="text-shadow" style={{ color: "var(--bal-light-gray)", fontSize: 22 }}>
                {attemptsLeft}/{MAX_ATTEMPTS}
              </span>
            )}
          </div>
          {dateKey && (
            <span className="text-shadow" style={{ color: "var(--bal-light-gray-text)", fontSize: 20 }}>
              {dateKey}
            </span>
          )}
        </div>

        {/* Input row */}
        {!done && (
          <div style={{
            display: "flex", gap: 14, flexWrap: "wrap",
            justifyContent: "center", alignItems: "flex-start",
          }}>
            <Field label="Ante">
              <Dropdown
                items={antes}
                value={ante}
                onChange={setAnte}
                minWidth={80}
                renderSelected={(v) => <span>{v}</span>}
                renderItem={(v) => <span className="item-name">{v}</span>}
              />
            </Field>

            <Field label="Stake">
              <Dropdown
                items={STAKES}
                value={stake}
                onChange={setStake}
                minWidth={140}
                renderSelected={(v) => (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon src={STAKE_ICONS[v]} /> {v}
                  </span>
                )}
                renderItem={(v) => (
                  <div className="item-row">
                    <Icon src={STAKE_ICONS[v]} />
                    <span className="item-name">{v}</span>
                  </div>
                )}
              />
            </Field>

            <Field label="Deck">
              <Dropdown
                items={DECKS}
                value={deck}
                onChange={setDeck}
                minWidth={140}
                renderSelected={(v) => (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon src={DECK_ICONS[v]} /> {v}
                  </span>
                )}
                renderItem={(v) => (
                  <div className="item-row">
                    <Icon src={DECK_ICONS[v]} />
                    <span className="item-name">{v}</span>
                  </div>
                )}
              />
            </Field>

            <Field label="Blind">
              <Dropdown
                items={BLINDS.map((b) => b.name)}
                value={blind}
                onChange={setBlind}
                minWidth={240}
                renderSelected={(v) => (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon src={blindIconPath(v)} /> {v}
                  </span>
                )}
                renderItem={(v) => {
                  const b = BLINDS.find((x) => x.name === v);
                  return (
                    <>
                      <div className="item-row">
                        <Icon src={blindIconPath(v)} />
                        <span className="item-name">{v}</span>
                      </div>
                      {b?.desc && <span className="item-desc">{b.desc}</span>}
                    </>
                  );
                }}
              />
            </Field>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{ height: 24 }} />
              <button
                className="pixel-corners btn-press"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: "10px 28px",
                  border: "none",
                  cursor: submitting ? "default" : "pointer",
                  background: "var(--bal-blue)",
                  color: "#fff",
                  fontWeight: "bold",
                  fontSize: 28,
                  fontFamily: "inherit",
                  textShadow: "0 2.5px 0 rgba(0,0,0,0.4)",
                  opacity: submitting ? 0.6 : 1,
                  transition: "background 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!submitting) e.currentTarget.style.background = "var(--bal-blue-active)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bal-blue)";
                }}
              >
                {submitting ? "..." : "Submit"}
              </button>
            </div>
          </div>
        )}

        {/* Previous guesses */}
        {gameState.guesses.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" , alignItems: "center" }}>
            {gameState.guesses.map((g, i) => (
              <GuessRow key={i} guess={g} />
            ))}
          </div>
        )}

        {/* Final result */}
        {done && (
          <div
            className="pixel-corners"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 10, padding: "14px 28px 18px",
              background: gameState.status === "won" ? "var(--bal-correct)" : "var(--bal-red-hover)",
            }}
          >
            <div
              className="text-shadow"
              style={{ fontSize: 36, fontWeight: "bold", color: "#fff", letterSpacing: 2 }}
            >
              {gameState.status === "won"
                ? `CORRECT! (${gameState.guesses.length}/${MAX_ATTEMPTS})`
                : "NOPE!"}
            </div>
            {gameState.answer && <AnswerRow answer={gameState.answer} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="text-shadow"
        style={{
          color: "var(--bal-yellow)",
          fontSize: 20, fontWeight: "bold",
          textTransform: "uppercase", letterSpacing: 1.5,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
