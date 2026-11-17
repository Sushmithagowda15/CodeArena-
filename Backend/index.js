require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

// -------------------------------
// Environment Configuration
// -------------------------------
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.RAPIDAPI_KEY || "";
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5500").replace(/\/+$/, "");

// -------------------------------
// CORS Configuration
// -------------------------------
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
    : [];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, or Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // Allow all Cloudflare Pages subdomains (*.pages.dev) and local development
        try {
            const url = new URL(origin);
            if (url.hostname.endsWith(".pages.dev") || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
                return callback(null, true);
            }
        } catch (e) {
            /* ignore invalid url */
        }
        return callback(null, true); // Fallback allow for public game access
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// -------------------------------
// In-memory storage
// -------------------------------
const battleStore = {};
const leaderboard = [];

// -------------------------------
// Problem bank
// -------------------------------
const problems = {
    beginner: [
        { id: 1, title: "Odd or Even", description: "Check if a number is odd or even.", input: "5", expectedOutput: "Odd" },
        { id: 2, title: "Sum Two Numbers", description: "Return sum of two numbers.", input: "3 7", expectedOutput: "10" }
    ],
    intermediate: [
        { id: 3, title: "Factorial", description: "Return factorial of a number.", input: "5", expectedOutput: "120" },
        { id: 4, title: "Reverse String", description: "Reverse given string.", input: "hello", expectedOutput: "olleh" }
    ],
    advanced: [
        { id: 5, title: "Palindrome Check", description: "Check if string is palindrome.", input: "madam", expectedOutput: "Yes" }
    ]
};

// -------------------------------
// Judge0 Language Mapping
// -------------------------------
const languageMap = { "52": 52, "50": 50, "71": 71, "63": 63 };

// -------------------------------
// Helpers
// -------------------------------
function makeBattleId() {
    return "battle_" + Date.now();
}

function computeStatusAndWinner(battle) {
    const expected = (battle.problem?.expectedOutput || "").trim();
    const p1Correct = (battle.player1Output || "").trim() === expected ? 1 : 0;
    const p2Correct = (battle.player2Output || "").trim() === expected ? 1 : 0;

    if (p1Correct > p2Correct) return { winner: "player1", winnerName: battle.player1 };
    if (p2Correct > p1Correct) return { winner: "player2", winnerName: battle.player2 };
    return { winner: "Draw", winnerName: "Draw" };
}

function finishBattle(battle) {
    if (battle.status === "finished") return;

    const { winner, winnerName } = computeStatusAndWinner(battle);
    battle.winner = winner;
    battle.winnerName = winnerName;
    battle.status = "finished";
    battle.finishedAt = Date.now();

    leaderboard.push({
        battleId: battle.battleId,
        player1: battle.player1,
        player2: battle.player2,
        winner: battle.winner,
        winnerName: battle.winnerName,
        timestamp: Date.now()
    });
}

// -------------------------------
// CREATE BATTLE
// -------------------------------
app.post("/battle/create", (req, res) => {
    const { creator, skill } = req.body;
    if (!creator || !skill || !creator.trim()) {
        return res.status(400).json({ success: false, error: "Missing creator or skill" });
    }

    const pool = problems[skill] || problems.beginner;
    const randomProblem = pool[Math.floor(Math.random() * pool.length)];

    const battleId = makeBattleId();
    battleStore[battleId] = {
        battleId,
        player1: creator.trim(),
        player2: null,
        problem: randomProblem,
        status: "waiting",
        player1Code: "",
        player2Code: "",
        player1Output: "",
        player2Output: "",
        player1Status: "",
        player2Status: "",
        player1Finished: false,
        player2Finished: false,
        ready1: false,
        ready2: false,
        startTime: null,
        timer: 10 * 60,
        winner: null,
        winnerName: null
    };

    const joinLink = `${FRONTEND_URL}/battle.html?battleId=${battleId}&player=${encodeURIComponent(creator.trim())}`;
    return res.json({ success: true, battleId, joinLink, battle: battleStore[battleId] });
});

// -------------------------------
// JOIN BATTLE
// -------------------------------
app.post("/battle/join/:battleId", (req, res) => {
    const { battleId } = req.params;
    const { playerName } = req.body;

    if (!playerName || !playerName.trim()) {
        return res.status(400).json({ success: false, error: "Player name is required" });
    }

    const trimmedName = playerName.trim();
    const battle = battleStore[battleId];
    if (!battle) return res.status(404).json({ success: false, error: "Battle not found" });

    if (battle.player1 === trimmedName || battle.player2 === trimmedName) {
        return res.json({ success: true, message: "Reconnected", battle });
    }
    if (battle.player2) return res.status(400).json({ success: false, error: "Battle already full" });

    battle.player2 = trimmedName;
    battle.status = "in-progress";
    if (!battle.startTime) {
        battle.startTime = Date.now();
    }
    return res.json({ success: true, message: "Joined battle successfully", battle });
});

// -------------------------------
// READY
// -------------------------------
app.post("/battle/ready", (req, res) => {
    const { battleId, player } = req.body;
    const battle = battleStore[battleId];
    if (!battle) return res.status(404).json({ success: false, error: "Battle not found" });

    if (player === battle.player1) battle.ready1 = true;
    if (player === battle.player2) battle.ready2 = true;

    if (!battle.startTime) {
        battle.startTime = Date.now();
        battle.status = "in-progress";
    }

    return res.json({ success: true, battle });
});

// -------------------------------
// RUN CODE
// -------------------------------
app.post("/run", async (req, res) => {
    const { code, language, stdin, battleId, player } = req.body;
    if (!code || !language) return res.status(400).json({ error: "code and language required" });

    const language_id = languageMap[language];
    if (!language_id) return res.status(400).json({ error: "Invalid language ID" });

    if (battleId && player && battleStore[battleId]) {
        const b = battleStore[battleId];
        if (player === b.player1) { b.player1Code = code; }
        if (player === b.player2) { b.player2Code = code; }
    }

    try {
        const encodedCode = Buffer.from(code, "utf-8").toString("base64");
        const encodedInput = Buffer.from(stdin || "", "utf-8").toString("base64");

        const response = await axios.post(
            "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true",
            { source_code: encodedCode, language_id, stdin: encodedInput },
            {
                headers: {
                    "X-RapidAPI-Key": API_KEY,
                    "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
                    "Content-Type": "application/json"
                }
            }
        );

        const compileOutput = response.data.compile_output
            ? Buffer.from(response.data.compile_output, "base64").toString("utf-8").trim()
            : null;
        const stdout = response.data.stdout
            ? Buffer.from(response.data.stdout, "base64").toString("utf-8").trim()
            : null;
        const stderr = response.data.stderr
            ? Buffer.from(response.data.stderr, "base64").toString("utf-8").trim()
            : null;

        const output = compileOutput || stdout || stderr || response.data.message || "No output";

        let status = "Error";
        if (compileOutput) {
            status = "Compilation Error";
        } else if (stderr) {
            status = "Runtime Error";
        } else if (battleId && battleStore[battleId]) {
            const expected = (battleStore[battleId].problem?.expectedOutput || "").trim();
            status = (output === expected) ? "Correct" : "Wrong Output";

            const b = battleStore[battleId];
            if (player === b.player1) { b.player1Output = output; b.player1Status = status; }
            if (player === b.player2) { b.player2Output = output; b.player2Status = status; }
        }

        return res.json({ output, status });
    } catch (err) {
        console.error("Judge0 Error:", err?.response?.data || err.message);
        return res.status(500).json({ error: "Judge0 API error" });
    }
});

// -------------------------------
// FINISH
// -------------------------------
app.post("/battle/finish", (req, res) => {
    const { battleId, playerName, code } = req.body;
    const battle = battleStore[battleId];
    if (!battle) return res.status(404).json({ success: false, error: "Battle not found" });

    // Save last code and record completion
    if (playerName === battle.player1) {
        battle.player1Code = code;
        battle.player1Finished = true;
    }
    if (playerName === battle.player2) {
        battle.player2Code = code;
        battle.player2Finished = true;
    }

    // Battle completes when both players have finished, or if only 1 player is in battle
    const bothFinished = battle.player2
        ? (battle.player1Finished && battle.player2Finished)
        : battle.player1Finished;

    if (bothFinished) {
        finishBattle(battle);
    }

    return res.json({
        success: true,
        battle,
        finished: battle.status === "finished",
        waitingForOpponent: !bothFinished
    });
});

// -------------------------------
// GET BATTLE
// -------------------------------
app.get("/battle/:battleId", (req, res) => {
    const { battleId } = req.params;
    const battle = battleStore[battleId];
    if (!battle) return res.status(404).json({ success: false, error: "Battle not found" });

    let remaining = battle.timer;
    if (battle.startTime) {
        const elapsed = Math.floor((Date.now() - battle.startTime) / 1000);
        remaining = Math.max(battle.timer - elapsed, 0);
    }

    if (remaining <= 0 && battle.status !== "finished") {
        finishBattle(battle);
    }

    const problem = battle.problem ? {
        statement: battle.problem.description,
        input: battle.problem.input,
        expectedOutput: battle.problem.expectedOutput
    } : null;

    return res.json({ success: true, battle: { ...battle, problem, remainingTime: remaining } });
});

// -------------------------------
// GET RESULT
// -------------------------------
app.get("/battle/:battleId/result", (req, res) => {
    const { battleId } = req.params;
    const battle = battleStore[battleId];
    if (!battle) return res.status(404).json({ success: false, error: "Battle not found" });

    return res.json({
        success: true,
        result: {
            battleId: battle.battleId,
            player1: battle.player1,
            player2: battle.player2,
            winner: battle.winner,
            winnerName: battle.winnerName,
            status: battle.status,
            player1Status: battle.player1Status,
            player2Status: battle.player2Status,
            player1Output: battle.player1Output,
            player2Output: battle.player2Output,
            player1Code: battle.player1Code,
            player2Code: battle.player2Code
        }
    });
});

// -------------------------------
// LEADERBOARD
// -------------------------------
app.get("/leaderboard", (req, res) => {
    const top = leaderboard.slice(-5).reverse();
    return res.json({ success: true, leaderboard: top });
});

// -------------------------------
// START SERVER
// -------------------------------
app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});
