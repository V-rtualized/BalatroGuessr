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

function getDailyUuid(): { uuid: string; dateKey: string } {
  const dateKey = getPSTDateKey();
  const hash = hashString("balatro-guessr-" + dateKey);
  const idx = Math.floor(seededRandom(hash) * uuids.length);
  return { uuid: uuids[idx], dateKey };
}

// --- Express app ---

const app = express();
app.use(express.json());

// API: get today's puzzle (uuid + image path only, no answer)
app.get("/api/daily", (_req, res) => {
  const { uuid, dateKey } = getDailyUuid();
  res.json({
    uuid,
    imageUrl: `/screenshots/${uuid}.png`,
    date: dateKey,
  });
});

// API: submit guess
app.post("/api/guess", (req, res) => {
  const { uuid, dateKey } = getDailyUuid();
  const { ante, stake, deck, blind } = req.body;

  if (!ante || !stake || !deck || !blind) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }

  // Verify the guess is for today's puzzle
  if (req.body.uuid && req.body.uuid !== uuid) {
    res.status(400).json({ error: "Stale puzzle" });
    return;
  }

  const answer = index[uuid];

  const isExact =
    answer.ante === ante &&
    answer.stake === stake &&
    answer.deck === deck &&
    answer.blind === blind;

  let isAlso = false;
  if (!isExact) {
    for (const otherUuid of answer.also_accept) {
      const other = index[otherUuid];
      if (
        other &&
        other.ante === ante &&
        other.stake === stake &&
        other.deck === deck &&
        other.blind === blind
      ) {
        isAlso = true;
        break;
      }
    }
  }

  const correct = isExact || isAlso;

  res.json({
    correct,
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
