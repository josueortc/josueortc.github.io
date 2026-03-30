async function loadFamilies() {
  const response = await fetch("./data/families.json");
  if (!response.ok) {
    throw new Error("Could not load family data.");
  }
  return response.json();
}

function renderFamilySelector(families) {
  const select = document.getElementById("family-select");
  const details = document.getElementById("family-details");
  if (!select || !details) return;
  select.innerHTML = families
    .map((f) => `<option value="${f.id}">${f.name}</option>`)
    .join("");
  const update = () => {
    const family = families.find((f) => f.id === select.value) || families[0];
    details.innerHTML = `
      <h3>${family.name}</h3>
      <p><strong>Latents:</strong> ${family.latents.join(", ")}</p>
      <p><strong>Variants:</strong> ${family.variants.join(", ")}</p>`;
  };
  select.addEventListener("change", update);
  update();
}

function renderModalities(families) {
  const grid = document.getElementById("modalities-grid");
  if (!grid) return;
  const modalities = [
    "Spiking (Poisson or overdispersed count)",
    "Calcium-like (filtered rate + noise)",
    "Field/mesoscale-like continuous regional signal",
    "Multimodal synchronized channels",
  ];
  grid.innerHTML = `
    <article class="card">
      <h3>Supported Modalities</h3>
      <ul>${modalities.map((m) => `<li>${m}</li>`).join("")}</ul>
    </article>
    <article class="card">
      <h3>Mechanism Families</h3>
      <ul>${families.map((f) => `<li>${f.name}</li>`).join("")}</ul>
    </article>`;
}

async function initFamiliesViz() {
  try {
    const families = await loadFamilies();
    renderFamilySelector(families);
    renderModalities(families);
  } catch (error) {
    const details = document.getElementById("family-details");
    const grid = document.getElementById("modalities-grid");
    if (details) {
      details.innerHTML = `<div class="empty-state">Family details unavailable.</div>`;
    }
    if (grid) {
      grid.innerHTML = `<div class="empty-state">Modality data unavailable.</div>`;
    }
  }
}

initFamiliesViz();
