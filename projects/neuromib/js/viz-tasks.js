async function loadJson(path) {
  const resp = await fetch(path);
  if (!resp.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return resp.json();
}

function renderWeights(weights) {
  const chart = document.getElementById("task-weight-chart");
  if (!chart) return;
  chart.innerHTML = "";
  Object.entries(weights).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div>${key.replaceAll("_", " ")}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${value * 100}%"></div></div>
      <div>${(value * 100).toFixed(0)}%</div>`;
    chart.appendChild(row);
  });
}

function renderTaskCards(tasks) {
  const cards = document.getElementById("task-cards");
  if (!cards) return;
  cards.innerHTML = "";
  tasks.forEach((task) => {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `
      <h3>${task.name}</h3>
      <p>${task.description}</p>
      <p class="meta">Metrics: ${task.metrics.join(", ")}</p>`;
    cards.appendChild(el);
  });
}

async function initTaskViz() {
  try {
    const [tasks, weights] = await Promise.all([
      loadJson("./data/tasks.json"),
      loadJson("./data/metrics_weights.json"),
    ]);
    renderTaskCards(tasks);
    renderWeights(weights);
  } catch (error) {
    console.error(error);
  }
}

initTaskViz();
