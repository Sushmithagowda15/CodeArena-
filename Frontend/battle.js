document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = (typeof API_CONFIG !== "undefined" && API_CONFIG.BASE_URL)
    ? API_CONFIG.BASE_URL
    : "http://localhost:3000";

  const params = new URLSearchParams(window.location.search);
  const battleId = params.get("battleId");
  let currentPlayer = (params.get("player") || "").trim();

  const $ = (id) => document.getElementById(id);

  if ($("battleId")) $("battleId").innerText = battleId || "N/A";

  // CodeMirror init
  const editor = CodeMirror.fromTextArea($("codeBox"), {
    mode: "text/x-c++src",
    theme: "dracula",
    lineNumbers: true,
    tabSize: 4,
  });

  // Language switch
  $("languageSelect")?.addEventListener("change", () => {
    const lang = $("languageSelect").value;
    if (lang === "71") editor.setOption("mode", "text/x-python");
    else if (lang === "63") editor.setOption("mode", "javascript");
    else editor.setOption("mode", "text/x-c++src");
  });

  let finished = false;

  async function applyBattle(b) {
    try {
      $("player1").innerText = b.player1 || "Waiting...";
      $("player2").innerText = b.player2 || "Waiting...";
      $("status").innerText = b.status || "waiting";
      $("problemText").innerText = (b.problem && (b.problem.statement || b.problem.description)) ? (b.problem.statement || b.problem.description) : "No problem loaded.";
      $("problemInput").innerText = (b.problem && b.problem.input) ? b.problem.input : "No input provided.";
      $("expectedOutput").innerText = (b.problem && b.problem.expectedOutput) ? b.problem.expectedOutput : "--";

      const remaining = typeof b.remainingTime === "number" ? b.remainingTime : (b.timer || 0);
      const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
      const ss = String(remaining % 60).padStart(2, "0");
      $("battleTimer").innerText = `${mm}:${ss}`;

      if (currentPlayer && (currentPlayer === b.player1 || currentPlayer === b.player2)) {
        $("joinSection").style.display = "none";
      } else {
        $("joinSection").style.display = "block";
      }

      if (b.status === "finished") {
        finished = true;
        $("opponentSection").style.display = "block";
        const oppCode = (currentPlayer === b.player1) ? (b.player2Code || "No code submitted") : (currentPlayer === b.player2) ? (b.player1Code || "No code submitted") : "No code submitted";
        $("opponentCode").innerText = oppCode;
        let winnerText = "";
        if (b.winner === "player1" || b.winner === b.player1) winnerText = `🏆 Winner: ${b.player1} — 🎉 Great job!`;
        else if (b.winner === "player2" || b.winner === b.player2) winnerText = `🏆 Winner: ${b.player2} — 🎉 Great job!`;
        else winnerText = "🤝 Draw — both played well!";
        $("winner").innerText = winnerText;
        setTimeout(() => {
          window.location.href = `result.html?battleId=${encodeURIComponent(battleId)}`;
        }, 1100);
      } else {
        $("opponentSection").style.display = "none";
        $("winner").innerText = "";
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadBattle() {
    if (!battleId) return;
    try {
      const res = await fetch(`${API_BASE}/battle/${encodeURIComponent(battleId)}`);
      const data = await res.json();
      if (data.success) await applyBattle(data.battle);
    } catch (e) {
      console.error(e);
    }
  }

  loadBattle();
  const battleInterval = setInterval(() => {
    if (finished) {
      clearInterval(battleInterval);
      return;
    }
    loadBattle();
  }, 2000);

  // Join button
  $("joinBtn")?.addEventListener("click", async () => {
    const name = $("joinName").value.trim();
    if (!name) return alert("Enter your name.");
    try {
      const res = await fetch(`${API_BASE}/battle/join/${encodeURIComponent(battleId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name }),
      });
      const data = await res.json();
      if (data.success) {
        currentPlayer = name;
        window.location.href = `battle.html?battleId=${encodeURIComponent(battleId)}&player=${encodeURIComponent(name)}`;
      } else {
        $("joinMsg").innerText = data.error || "Join failed";
      }
    } catch (e) {
      console.error(e);
      $("joinMsg").innerText = "Server error";
    }
  });

  // Run code
  $("runBtn")?.addEventListener("click", async () => {
    if (!currentPlayer) return alert("Join the battle first (enter name + Join).");
    const code = editor.getValue().trim();
    const lang = $("languageSelect").value;
    if (!code) return ($("outputBox").innerText = "Enter code first.");
    $("outputBox").innerText = "Running...";
    $("statusText").innerText = "";
    try {
      const input = $("problemInput").innerText || "";
      const res = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: lang, stdin: input, battleId, player: currentPlayer }),
      });
      const data = await res.json();
      $("outputBox").innerText = data.output || data.error || "No output";
      if (data.status) $("statusText").innerText = "Status: " + data.status;
    } catch (e) {
      console.error(e);
      $("outputBox").innerText = "Backend error";
    }
  });

  // Copy / Clear
  $("copyBtn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(editor.getValue());
    alert("Copied!");
  });

  $("clearBtn")?.addEventListener("click", () => {
    editor.setValue("");
    $("outputBox").innerText = "Output will appear here...";
    $("statusText").innerText = "";
  });

  // Finish
  $("finishBtn")?.addEventListener("click", async () => {
    if (!battleId || !currentPlayer) return;
    try {
      const code = editor.getValue().trim();
      await fetch(`${API_BASE}/battle/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId, playerName: currentPlayer, code }),
      });
    } catch (e) {
      console.error(e);
    }
  });
});
