let sortKey = "total";
let descending = true;

async function loadLeaderboard() {
  const response = await fetch("./data/leaderboard_public_mock.json");
  if (!response.ok) {
    throw new Error("Could not load leaderboard data.");
  }
  return response.json();
}

function scoreCell(value) {
  return Number(value).toFixed(3);
}

function setStatus(message, type = "info") {
  const status = document.getElementById("leaderboard-status");
  if (!status) return;
  status.textContent = message;
  status.className = type === "error" ? "status status--error" : "status";
}

function renderTable(rows) {
  const wrap = document.getElementById("leaderboard-table-wrap");
  if (!wrap) return;
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-state">No entries found for the selected track.</div>`;
    return;
  }
  const headers = [
    ["team", "Team"],
    ["method", "Method"],
    ["track", "Track"],
    ["submission_date", "Submission Date"],
    ["benchmark_version", "Version"],
    ["latent", "Latent"],
    ["mechanism", "Mechanism"],
    ["support", "Support"],
    ["intervention", "Intervention"],
    ["total", "Total"],
  ];
  wrap.innerHTML = `
    <table>
      <caption>Sortable leaderboard table. Use column headers to change sort order.</caption>
      <thead>
        <tr>
          ${headers
            .map(
              ([k, label]) =>
                `<th><button data-sort="${k}">${label}${sortKey === k ? (descending ? " ↓" : " ↑") : ""}</button></th>`
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr>
              <td>${row.team}</td>
              <td>${row.method}</td>
              <td>${row.track}</td>
              <td>${row.submission_date || "-"}</td>
              <td>${row.benchmark_version || "-"}</td>
              <td>${scoreCell(row.latent)}</td>
              <td>${scoreCell(row.mechanism)}</td>
              <td>${scoreCell(row.support)}</td>
              <td>${scoreCell(row.intervention)}</td>
              <td><strong>${scoreCell(row.total)}</strong></td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  wrap.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-sort");
      if (!key) return;
      if (sortKey === key) {
        descending = !descending;
      } else {
        sortKey = key;
        descending = true;
      }
      initLeaderboard();
    });
  });
}

async function initLeaderboard() {
  setStatus("Loading leaderboard...");
  try {
    const allRows = await loadLeaderboard();
    const filterEl = document.getElementById("track-filter");
    const filter = filterEl ? filterEl.value : "all";
    let rows = allRows;
    if (filter !== "all") {
      rows = rows.filter((r) => r.track === filter);
    }
    rows.sort((a, b) => {
      if (typeof a[sortKey] === "string") {
        return descending
          ? String(b[sortKey]).localeCompare(String(a[sortKey]))
          : String(a[sortKey]).localeCompare(String(b[sortKey]));
      }
      return descending ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey];
    });
    renderTable(rows);
    setStatus(`Showing ${rows.length} entries (${filter} track filter).`);
    if (filterEl) {
      filterEl.onchange = () => initLeaderboard();
    }
  } catch (error) {
    setStatus("Could not load leaderboard data. Please refresh or verify data files.", "error");
    const wrap = document.getElementById("leaderboard-table-wrap");
    if (wrap) {
      wrap.innerHTML = `<div class="empty-state">Leaderboard unavailable.</div>`;
    }
  }
}

initLeaderboard();
