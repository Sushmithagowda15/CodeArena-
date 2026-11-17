document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = (typeof API_CONFIG !== "undefined" && API_CONFIG.BASE_URL)
    ? API_CONFIG.BASE_URL
    : "http://localhost:3000";

  const $ = (id) => document.getElementById(id);

  // Create battle (skill-based)
  $("createBattleBtn")?.addEventListener("click", async () => {
    const creator = $("creatorName").value.trim();
    const skill = $("skillSelect").value;
    const msg = $("createMsg");

    if (!creator) return alert("Enter your name!");

    try {
      const res = await fetch(`${API_BASE}/battle/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator, skill })
      });
      const data = await res.json();

      if (data.success && data.battleId) {
        msg.innerText = "Battle created!";
        // IMPORTANT: pass player in query so battle page never shows "waiting" for creator
        window.location.href = `battle.html?battleId=${data.battleId}&player=${encodeURIComponent(creator)}`;
      } else {
        msg.innerText = data.error || "Create failed";
      }
    } catch (e) {
      console.error(e);
      msg.innerText = "Server error (check connection to backend)";
    }
  });

  // Join battle
  $("joinBattleBtn")?.addEventListener("click", async () => {
    const battleId = $("joinBattleId").value.trim();
    const player = $("joinName").value.trim();
    const msg = $("joinMsg");

    if (!battleId || !player) return alert("Enter Battle ID and your name.");

    try {
      const res = await fetch(`${API_BASE}/battle/join/${encodeURIComponent(battleId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: player })
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = `battle.html?battleId=${battleId}&player=${encodeURIComponent(player)}`;
      } else {
        msg.innerText = data.error || "Join failed";
      }
    } catch (e) {
      console.error(e);
      msg.innerText = "Server error (check connection to backend)";
    }
  });

  // Leaderboard
  async function loadLeaderboard() {
    const box = $("leaderboardBox");
    box.innerText = "Loading...";
    try {
      const res = await fetch(`${API_BASE}/leaderboard`);
      const data = await res.json();
      if (!data.success || !Array.isArray(data.leaderboard) || data.leaderboard.length === 0) {
        box.innerText = "No results yet.";
        return;
      }
      box.innerHTML = "<pre>" + data.leaderboard.map((r, i) => {
        const w = (r.winner === "player1" || r.winner === r.player1)
          ? r.player1
          : (r.winner === "player2" || r.winner === r.player2)
            ? r.player2
            : "Draw";
        return `${i + 1}. ${r.player1} vs ${r.player2} → Winner: ${w}`;
      }).join("\n") + "</pre>";
    } catch (e) {
      console.error(e);
      box.innerText = "Failed to load leaderboard.";
    }
  }

  loadLeaderboard();
});
