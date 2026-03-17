import express from "express";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(import.meta.dirname, "public");
const DIST_DIR = path.resolve(import.meta.dirname, "dist");

// Load index once at startup
const index: Record<
  string,
  {
    ante: number;
    stake: string;
    deck: string;
    blind: string;
    score: number;
    score_text: string;
    blind_type: string;
    filename: string;
    also_accept: string[];
  }
> = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "screenshots_index.json"), "utf-8")
);
const uuids = Object.keys(index);

// --- Date helpers (PST = UTC-8) ---

function getPSTDateKey(): string {
  const now = new Date();
  const pst = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return pst.toISOString().slice(0, 10);
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// --- Weighted selection ---

// Precompute weights for each UUID
const weights: number[] = uuids.map((uuid) => {
  const info = index[uuid];
  let w = 1;

  // Unique answers (no also_accept) are slightly more interesting
  if (info.also_accept.length === 0) w *= 1.2;

  // Ante 2-8 are the sweet spot; 1 is too easy, 9-12 too obvious
  // Bell curve centered around ante 5 for 2-8, lower for extremes
  const anteWeights: Record<number, number> = {
    1: 0.4, 2: 0.8, 3: 1.0, 4: 1.2, 5: 1.3,
    6: 1.2, 7: 1.0, 8: 0.8, 9: 0.5, 10: 0.4, 11: 0.3, 12: 0.3,
  };
  w *= anteWeights[info.ante] ?? 0.5;

  // Plasma is rarer — weight it down to ~1/4 of Normal
  if (info.deck === "Plasma") w *= 0.33;

  // White+Normal is the most "default" combo, make it less frequent
  if (info.stake === "White" && info.deck === "Normal") w *= 0.75;

  return w;
});

// Build cumulative distribution
const totalWeight = weights.reduce((a, b) => a + b, 0);
const cdf: number[] = [];
let cumulative = 0;
for (const w of weights) {
  cumulative += w / totalWeight;
  cdf.push(cumulative);
}

function getDailyUuid(): { uuid: string; dateKey: string } {
  const dateKey = getPSTDateKey();
  const hash = hashString("balatro-guessr-" + dateKey);
  const r = seededRandom(hash);

  // Binary search the CDF
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < r) lo = mid + 1;
    else hi = mid;
  }

  return { uuid: uuids[lo], dateKey };
}

// --- Express app ---

const app = express();
app.use(express.json());

// API: get current PST date
app.get("/api/date", (_req, res) => {
  res.json({ date: getPSTDateKey() });
});

// API: get today's puzzle (uuid + image path only, no answer)
app.get("/api/daily", (_req, res) => {
  const { uuid, dateKey } = getDailyUuid();
  res.json({
    uuid,
    imageUrl: `/screenshots/${uuid}.png`,
    date: dateKey,
  });
});

// API: check a guess (returns per-field correctness, no answer reveal)
app.post("/api/check", (req, res) => {
  const { uuid } = getDailyUuid();
  const { ante, stake, deck, blind } = req.body;

  if (!ante || !stake || !deck || !blind) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }

  if (req.body.uuid && req.body.uuid !== uuid) {
    res.status(400).json({ error: "Stale puzzle" });
    return;
  }

  const answer = index[uuid];

  // Check each field against the exact answer AND all also_accept variants
  const allValid = [answer, ...answer.also_accept.map((id) => index[id]).filter(Boolean)];

  const anteCorrect = allValid.some((a) => a.ante === ante);
  const stakeCorrect = allValid.some((a) => a.stake === stake);
  const deckCorrect = allValid.some((a) => a.deck === deck);
  const blindCorrect = allValid.some((a) => a.blind === blind);
  const allCorrect = allValid.some(
    (a) => a.ante === ante && a.stake === stake && a.deck === deck && a.blind === blind
  );

  res.json({
    correct: allCorrect,
    fields: {
      ante: anteCorrect,
      stake: stakeCorrect,
      deck: deckCorrect,
      blind: blindCorrect,
    },
  });
});

// API: get the answer (called after all attempts exhausted or correct guess)
app.get("/api/answer", (_req, res) => {
  const { uuid, dateKey } = getDailyUuid();
  const answer = index[uuid];
  res.json({
    date: dateKey,
    answer: {
      ante: answer.ante,
      stake: answer.stake,
      deck: answer.deck,
      blind: answer.blind,
    },
  });
});

// Serve screenshots
app.use(
  "/screenshots",
  express.static(path.join(DATA_DIR, "screenshots"), {
    maxAge: "7d",
    immutable: true,
  })
);

// Serve built React app
app.use(express.static(DIST_DIR));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Balatro Guessr running on port ${PORT}`);
  console.log(`Today's date (PST): ${getPSTDateKey()}`);
  console.log(`Today's UUID: ${getDailyUuid().uuid}`);
  console.log(`Total puzzles: ${uuids.length}`);
});
