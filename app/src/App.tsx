import { useState, useEffect } from "react";

type GameState = {
  status: "playing" | "won" | "lost";
  guess?: { ante: number; stake: string; deck: string; blind: string };
  answer?: { ante: number; stake: string; deck: string; blind: string };
};

const STAKES = ["White", "Green", "Purple"];
const DECKS = ["Normal", "Plasma"];
const BLINDS: { name: string; desc?: string }[] = [
  { name: "Small Blind" },
  { name: "Big Blind" },
  { name: "Amber Acorn", desc: "Flips and shuffles all Joker cards" },
  { name: "Cerulean Bell", desc: "Forces 1 card to always be selected" },
  { name: "Crimson Heart", desc: "One random Joker disabled every hand" },
  { name: "The Arm", desc: "Lowers level of played poker hand" },
  { name: "The Club", desc: "All Club cards are debuffed" },
  { name: "The Eye", desc: "No repeat hand types this round" },
  { name: "The Fish", desc: "Cards drawn face down after each hand" },
  { name: "The Flint", desc: "Base Chips and Mult are halved" },
  { name: "The Goad", desc: "All Spade cards are debuffed" },
  { name: "The Head", desc: "All Heart cards are debuffed" },
  { name: "The Hook", desc: "Discards 2 random cards per hand" },
  { name: "The House", desc: "First hand is drawn face down" },
  { name: "The Manacle", desc: "-1 hand size" },
  { name: "The Mark", desc: "All face cards are drawn face down" },
  { name: "The Mouth", desc: "Play only 1 hand type this round" },
  { name: "The Needle", desc: "Play only 1 hand" },
  { name: "The Ox", desc: "Playing a #1 most played hand sets money to $0" },
  { name: "The Pillar", desc: "Cards played previously this Ante are debuffed" },
  { name: "The Plant", desc: "All face cards are debuffed" },
  { name: "The Psychic", desc: "Must play 5 cards" },
  { name: "The Serpent", desc: "After Play or Discard, always draw 3 cards" },
  { name: "The Tooth", desc: "Lose $1 per card played" },
  { name: "The Wall", desc: "Extra large blind" },
  { name: "The Water", desc: "Start with 0 discards" },
  { name: "The Wheel", desc: "1 in 7 cards drawn face down" },
  { name: "The Window", desc: "All Diamond cards are debuffed" },
  { name: "Verdant Leaf", desc: "All cards are debuffed" },
  { name: "Violet Vessel", desc: "Very large blind" },
];

function loadState(dateKey: string): GameState | null {
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith("bg_state="));
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
  document.cookie = `bg_state=${encodeURIComponent(JSON.stringify({ date: dateKey, state }))};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

export default function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [puzzleUuid, setPuzzleUuid] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({ status: "playing" });
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
        if (saved) {
          setGameState(saved);
          if (saved.guess) {
            setAnte(saved.guess.ante);
            setStake(saved.guess.stake);
            setDeck(saved.guess.deck);
            setBlind(saved.guess.blind);
          }
        }
      });
  }, []);

  async function handleSubmit() {
    if (!puzzleUuid || !dateKey || gameState.status !== "playing") return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: puzzleUuid, ante, stake, deck, blind }),
      });
      const result = await res.json();

      const newState: GameState = {
        status: result.correct ? "won" : "lost",
        guess: { ante, stake, deck, blind },
        answer: result.answer,
      };
      setGameState(newState);
      saveState(dateKey, newState);
    } finally {
      setSubmitting(false);
    }
  }

  if (!imageUrl) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>Loading...</div>;
  }

  const done = gameState.status !== "playing";
  const answer = gameState.answer;

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
        gap: 12, padding: "16px 16px 20px",
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      }}>
        <h1 style={{ color: "#fff", margin: 0, fontSize: 22, letterSpacing: 2 }}>
          BALATRO GUESSR
        </h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end" }}>
          <Field label="Ante">
            <select value={ante} onChange={(e) => setAnte(Number(e.target.value))} disabled={done} style={selectStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>

          <Field label="Stake">
            <select value={stake} onChange={(e) => setStake(e.target.value)} disabled={done} style={selectStyle}>
              {STAKES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Deck">
            <select value={deck} onChange={(e) => setDeck(e.target.value)} disabled={done} style={selectStyle}>
              {DECKS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>

          <Field label="Blind">
            <select value={blind} onChange={(e) => setBlind(e.target.value)} disabled={done} style={{ ...selectStyle, minWidth: 160 }}>
              {BLINDS.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}{b.desc ? ` — ${b.desc}` : ""}
                </option>
              ))}
            </select>
            {(() => {
              const sel = BLINDS.find((b) => b.name === blind);
              return sel?.desc ? (
                <span style={{ color: "#888", fontSize: 10, maxWidth: 180, lineHeight: "1.3" }}>{sel.desc}</span>
              ) : null;
            })()}
          </Field>

          <button
            onClick={handleSubmit}
            disabled={done || submitting}
            style={{
              ...selectStyle,
              cursor: done || submitting ? "default" : "pointer",
              background: done ? "#555" : "#e8c33a",
              color: done ? "#999" : "#000",
              fontWeight: "bold", border: "none", minWidth: 80,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "..." : "Submit"}
          </button>
        </div>

        {done && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              fontSize: 20, fontWeight: "bold",
              color: gameState.status === "won" ? "#4caf50" : "#f44336",
            }}>
              {gameState.status === "won" ? "CORRECT!" : "WRONG!"}
            </div>
            {answer && (
              <div style={{ color: "#ccc", fontSize: 13, textAlign: "center" }}>
                Answer: Ante {answer.ante} / {answer.stake} Stake / {answer.deck} Deck / {answer.blind}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ color: "#aaa", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      {children}
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 4, border: "1px solid #555",
  background: "#222", color: "#fff", fontFamily: "inherit", fontSize: 14,
};
