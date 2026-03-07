const STORAGE_KEY = "mtg-binder-tracker-data-v3";
const SETTINGS_KEY = "mtg-binder-tracker-settings-v3";

const defaultSettings = {
  priceSource: "scryfall",
  cardmarketProxyUrl: "",
  visibleFields: {
    set: true,
    quantity: true,
    condition: true,
    finish: true,
    unitPrice: true,
    totalPrice: true,
    updatedAt: true
  }
};

const state = {
  binder: [],
  searchResults: [],
  selectedCardName: "",
  printings: [],
  selectedPrintingId: null,
  settings: loadSettings()
};

const els = {
  openAddModalBtn: document.getElementById("openAddModalBtn"),
  closeAddModalBtn: document.getElementById("closeAddModalBtn"),
  addCardDialog: document.getElementById("addCardDialog"),

  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  searchStatus: document.getElementById("searchStatus"),
  resultSelect: document.getElementById("resultSelect"),
  printingGrid: document.getElementById("printingGrid"),
  printingSelectionInfo: document.getElementById("printingSelectionInfo"),

  quantityInput: document.getElementById("quantityInput"),
  conditionSelect: document.getElementById("conditionSelect"),
  finishSelect: document.getElementById("finishSelect"),
  addBtn: document.getElementById("addBtn"),

  binderGrid: document.getElementById("binderGrid"),
  entryCount: document.getElementById("entryCount"),
  cardCount: document.getElementById("cardCount"),
  totalValue: document.getElementById("totalValue"),

  filterText: document.getElementById("filterText"),
  sortSelect: document.getElementById("sortSelect"),
  groupSelect: document.getElementById("groupSelect"),

  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  importBtn: document.getElementById("importBtn"),

  settingsBtn: document.getElementById("settingsBtn"),
  settingsDialog: document.getElementById("settingsDialog"),
  priceSourceSelect: document.getElementById("priceSourceSelect"),
  cardmarketProxyInput: document.getElementById("cardmarketProxyInput"),

  showSetToggle: document.getElementById("showSetToggle"),
  showQuantityToggle: document.getElementById("showQuantityToggle"),
  showConditionToggle: document.getElementById("showConditionToggle"),
  showFinishToggle: document.getElementById("showFinishToggle"),
  showUnitPriceToggle: document.getElementById("showUnitPriceToggle"),
  showTotalPriceToggle: document.getElementById("showTotalPriceToggle"),
  showUpdatedAtToggle: document.getElementById("showUpdatedAtToggle"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),

  qrBtn: document.getElementById("qrBtn"),
  qrDialog: document.getElementById("qrDialog"),
  qrCode: document.getElementById("qrCode"),
  qrUrl: document.getElementById("qrUrl"),

  template: document.getElementById("binderCardTemplate"),
  toastContainer: document.getElementById("toastContainer")
};

init();

function init() {
  state.binder = loadBinder();
  hydrateSettingsUi();
  bindEvents();
  hydrateMissingBinderMetadata().finally(() => {
    renderBinder();
  });
}

async function hydrateMissingBinderMetadata() {
  const itemsToUpdate = state.binder.filter((item) => {
    return item.cardId && (!item.typeLine || String(item.typeLine).trim() === "");
  });

  if (itemsToUpdate.length === 0) {
    return;
  }

  let hasChanges = false;

  for (const item of itemsToUpdate) {
    try {
      const printing = await loadPrintingById(item.cardId);

      if (printing?.type_line) {
        item.typeLine = printing.type_line;
        hasChanges = true;
      }

      if ((!item.setName || !item.imageUrl) && printing) {
        item.setName = item.setName || printing.set_name || "";
        item.imageUrl =
          item.imageUrl ||
          printing.image_uris?.normal ||
          printing.image_uris?.large ||
          printing.card_faces?.[0]?.image_uris?.normal ||
          printing.card_faces?.[0]?.image_uris?.large ||
          "";
        hasChanges = true;
      }
    } catch (error) {
      console.error(`Metadaten konnten nicht geladen werden für ${item.name}`, error);
    }
  }

  if (hasChanges) {
    persistBinder();
  }
}

function bindEvents() {
  els.openAddModalBtn.addEventListener("click", openAddDialog);
  els.searchBtn.addEventListener("click", onSearchClick);

  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearchClick();
    }
  });

  els.resultSelect.addEventListener("change", onSelectSearchResult);
  els.addBtn.addEventListener("click", onAddToBinder);

  els.filterText.addEventListener("input", renderBinder);
  els.sortSelect.addEventListener("change", renderBinder);
  els.groupSelect.addEventListener("change", renderBinder);

  els.exportBtn.addEventListener("click", exportJson);
  els.importInput.addEventListener("change", importJson);
  els.importBtn?.addEventListener("click", () => {
  els.importInput.click();
});

  els.settingsBtn.addEventListener("click", () => {
    hydrateSettingsUi();
    els.settingsDialog.showModal();
  });

  els.saveSettingsBtn.addEventListener("click", saveSettingsFromDialog);

  els.addCardDialog.addEventListener("close", () => {
    document.body.style.overflow = "";
  });

  els.settingsDialog.addEventListener("close", () => {
    document.body.style.overflow = "";
  });

  els.qrBtn?.addEventListener("click", openQrDialog);
}

function openAddDialog() {
  document.body.style.overflow = "hidden";

  els.quantityInput.value = "1";
  els.conditionSelect.value = "NM";
  els.finishSelect.value = "nonfoil";

  els.addCardDialog.showModal();

  setTimeout(() => {
    els.searchInput.focus();
  }, 30);
}

function hydrateSettingsUi() {
  els.priceSourceSelect.value = state.settings.priceSource;
  els.cardmarketProxyInput.value = state.settings.cardmarketProxyUrl || "";

  els.showSetToggle.checked = !!state.settings.visibleFields.set;
  els.showQuantityToggle.checked = !!state.settings.visibleFields.quantity;
  els.showConditionToggle.checked = !!state.settings.visibleFields.condition;
  els.showFinishToggle.checked = !!state.settings.visibleFields.finish;
  els.showUnitPriceToggle.checked = !!state.settings.visibleFields.unitPrice;
  els.showTotalPriceToggle.checked = !!state.settings.visibleFields.totalPrice;
  els.showUpdatedAtToggle.checked = !!state.settings.visibleFields.updatedAt;
}

async function onSearchClick() {
  const query = els.searchInput.value.trim();
  if (!query) {
    showToast("Bitte zuerst einen Suchbegriff eingeben.", "error");
    return;
  }

  setSearchStatus("Suche läuft...");
  clearSelect(els.resultSelect);
  clearPrintingGrid();
  state.searchResults = [];
  state.printings = [];
  state.selectedPrintingId = null;
  updatePrintingSelectionInfo(null);

  try {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${query}" or ${query}`)}&unique=cards&order=name`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Scryfall Search Fehler: ${response.status}`);
    }

    const data = await response.json();
    const cards = Array.isArray(data.data) ? data.data : [];

    const uniqueNames = dedupeBy(cards, (c) => c.name).map((c) => ({
      name: c.name,
      setName: c.set_name,
      releasedAt: c.released_at
    }));

    state.searchResults = uniqueNames;
    populateResultSelect(uniqueNames);

    if (uniqueNames.length === 0) {
      setSearchStatus("Keine Karten gefunden.");
      return;
    }

    setSearchStatus(`${uniqueNames.length} Karten gefunden.`);
    els.resultSelect.selectedIndex = 0;
    await onSelectSearchResult();
  } catch (error) {
    console.error(error);
    setSearchStatus("Suche fehlgeschlagen.");
    showToast("Konnte keine Karten laden.", "error");
  }
}

async function onSelectSearchResult() {
  const selectedIndex = els.resultSelect.selectedIndex;
  if (selectedIndex < 0 || !state.searchResults[selectedIndex]) {
    return;
  }

  const selected = state.searchResults[selectedIndex];
  state.selectedCardName = selected.name;

  setSearchStatus(`Lade Printings für ${selected.name}...`);
  clearPrintingGrid();
  state.printings = [];
  state.selectedPrintingId = null;
  updatePrintingSelectionInfo(null);

  try {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${selected.name}"`)}&unique=prints&order=released`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Scryfall Printings Fehler: ${response.status}`);
    }

    const data = await response.json();
    const printings = Array.isArray(data.data) ? data.data : [];

    state.printings = printings
      .filter((p) => Array.isArray(p.games) && p.games.includes("paper"))
      .sort((a, b) => {
        const da = a.released_at || "";
        const db = b.released_at || "";
        return db.localeCompare(da);
      });

    if (state.printings.length === 0) {
      clearPrintingGrid();
      setSearchStatus("Keine Paper Printings gefunden.");
      return;
    }

    state.selectedPrintingId = state.printings[0].id;
    renderPrintingGrid(state.printings);
    updatePrintingSelectionInfo(state.printings[0]);
    setSearchStatus(`${state.printings.length} Printings gefunden.`);
  } catch (error) {
    console.error(error);
    setSearchStatus("Printings konnten nicht geladen werden.");
    showToast("Konnte Printings nicht laden.", "error");
  }
}

async function onAddToBinder() {
  const printing = state.printings.find((p) => p.id === state.selectedPrintingId);

  if (!printing) {
    showToast("Bitte zuerst ein Printing auswählen.", "error");
    return;
  }

  const quantity = Math.max(1, Number(els.quantityInput.value) || 1);
  const condition = els.conditionSelect.value;
  const selectedFinish = els.finishSelect.value;
  const finish = resolveFinish(selectedFinish);
  const prices = await fetchPriceForPrinting(printing, finish);

  const entry = {
    entryId: crypto.randomUUID(),
    cardId: printing.id,
    oracleId: printing.oracle_id || null,
    name: printing.name,
    set: printing.set || "",
    setName: printing.set_name || "",
    collectorNumber: printing.collector_number || "",
    releasedAt: printing.released_at || "",
    lang: printing.lang || "en",
    rarity: printing.rarity || "",
    imageUrl:
      printing.image_uris?.normal ||
      printing.image_uris?.large ||
      printing.card_faces?.[0]?.image_uris?.normal ||
      printing.card_faces?.[0]?.image_uris?.large ||
      "",
    scryfallUri: printing.scryfall_uri || "",
    quantity,
    condition,
    finish,
    prices,
    addedAt: new Date().toISOString()
  };

  state.binder.push(entry);
  persistBinder();
  renderBinder();
  showToast(`${entry.name} wurde hinzugefügt.`, "success");
  els.addCardDialog.close();
}

function populateResultSelect(items) {
  clearSelect(els.resultSelect);

  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.name;
    opt.textContent = item.name;
    els.resultSelect.appendChild(opt);
  });
}

function renderPrintingGrid(items) {
  clearPrintingGrid();

  if (!items || items.length === 0) {
    els.printingGrid.innerHTML = `<div class="muted">Keine Printings gefunden.</div>`;
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "printing-option";

    if (item.id === state.selectedPrintingId) {
      button.classList.add("selected");
    }

    const imageUrl =
      item.image_uris?.small ||
      item.image_uris?.normal ||
      item.card_faces?.[0]?.image_uris?.small ||
      item.card_faces?.[0]?.image_uris?.normal ||
      "";

    const finishLabels = [];
    if (item.nonfoil) finishLabels.push("Nonfoil");
    if (item.foil) finishLabels.push("Foil");
    if (Array.isArray(item.finishes) && item.finishes.includes("etched")) finishLabels.push("Etched");
    if (item.promo) finishLabels.push("Promo");
    if (item.lang && item.lang !== "en") finishLabels.push(item.lang.toUpperCase());

    const previewPrice = getPreviewPrice(item);

    button.innerHTML = `
      <img class="printing-option-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" />
      <div class="printing-option-title">${escapeHtml(item.set_name || item.name)}</div>
      <div class="printing-option-meta">
        #${escapeHtml(item.collector_number || "?")} · ${escapeHtml((item.set || "").toUpperCase())}<br>
        ${escapeHtml(item.released_at || "ohne Datum")}<br>
        ${escapeHtml(finishLabels.join(", ") || "Unbekanntes Finish")}
      </div>
      <div class="printing-option-price">${escapeHtml(previewPrice)}</div>
    `;

    button.addEventListener("click", () => {
      state.selectedPrintingId = item.id;
      renderPrintingGrid(state.printings);
      updatePrintingSelectionInfo(item);
    });

    els.printingGrid.appendChild(button);
  });
}

function buildCardmarketUrl(item) {
  return `https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(item.name)}`;
}

function updatePrintingSelectionInfo(item) {
  if (!item) {
    els.printingSelectionInfo.textContent = "Noch kein Printing ausgewählt";
    return;
  }

  const setCode = (item.set || "").toUpperCase();
  const collector = item.collector_number || "?";
  els.printingSelectionInfo.textContent = `${setCode} #${collector}`;
}

function clearPrintingGrid() {
  els.printingGrid.innerHTML = "";
}

function clearSelect(select) {
  select.innerHTML = "";
}

function setSearchStatus(text) {
  els.searchStatus.textContent = text;
}

function resolveFinish(selectedFinish) {
  return selectedFinish;
}

async function fetchPriceForPrinting(printing, finish) {
  if (state.settings.priceSource === "cardmarket-proxy" && state.settings.cardmarketProxyUrl) {
    try {
      const url = new URL(state.settings.cardmarketProxyUrl);
      url.searchParams.set("cardId", printing.id);
      url.searchParams.set("name", printing.name);
      url.searchParams.set("set", printing.set);
      url.searchParams.set("collectorNumber", printing.collector_number || "");
      url.searchParams.set("finish", finish);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Cardmarket Proxy Fehler ${response.status}`);
      }

      const data = await response.json();
      return normalizeExternalPrice(data, printing, finish);
    } catch (error) {
      console.error(error);
      showToast("Cardmarket Proxy fehlgeschlagen. Nutze Scryfall Fallback.", "error");
    }
  }

  return getScryfallPrice(printing, finish);
}

function getScryfallPrice(printing, finish) {
  const prices = printing.prices || {};
  let amount = null;
  let currency = "EUR";
  let source = "Scryfall";

  if (finish === "etched" && prices.eur_etched) {
    amount = Number(prices.eur_etched);
  } else if (finish === "foil" && prices.eur_foil) {
    amount = Number(prices.eur_foil);
  } else if (prices.eur) {
    amount = Number(prices.eur);
  } else if (finish === "foil" && prices.usd_foil) {
    amount = Number(prices.usd_foil);
    currency = "USD";
  } else if (prices.usd) {
    amount = Number(prices.usd);
    currency = "USD";
  }

  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency,
    source,
    updatedAt: new Date().toISOString()
  };
}

function normalizeExternalPrice(data, printing, finish) {
  if (data && typeof data === "object" && Number.isFinite(Number(data.amount))) {
    return {
      amount: Number(data.amount),
      currency: data.currency || "EUR",
      source: data.source || "Cardmarket Proxy",
      updatedAt: new Date().toISOString()
    };
  }

  return getScryfallPrice(printing, finish);
}

function getPreviewPrice(printing) {
  const prices = printing.prices || {};

  if (prices.eur) {
    return `Ab ${formatCurrency(Number(prices.eur), "EUR")}`;
  }

  if (prices.eur_foil) {
    return `Foil ${formatCurrency(Number(prices.eur_foil), "EUR")}`;
  }

  if (prices.eur_etched) {
    return `Etched ${formatCurrency(Number(prices.eur_etched), "EUR")}`;
  }

  if (prices.usd) {
    return `Ab ${formatCurrency(Number(prices.usd), "USD")}`;
  }

  return "Preis nicht verfügbar";
}

function renderBinder() {
  const filter = els.filterText?.value.trim().toLowerCase() || "";
  const sort = els.sortSelect?.value || "name-asc";
  const group = els.groupSelect?.value || "none";

  let items = [...state.binder];

  if (filter) {
    items = items.filter((item) => {
      return (
        String(item.name || "").toLowerCase().includes(filter) ||
        String(item.setName || "").toLowerCase().includes(filter) ||
        String(item.set || "").toLowerCase().includes(filter) ||
        String(item.typeLine || "").toLowerCase().includes(filter)
      );
    });
  }

  items.sort((a, b) => sortBinder(a, b, sort));

  els.binderGrid.innerHTML = "";

  if (items.length === 0) {
    els.binderGrid.innerHTML = `<div class="empty-state">Noch keine Karten im Binder.</div>`;
    updateStats([]);
    return;
  }

  if (group === "set") {
    const grouped = groupBy(items, (x) => `${x.setName}|||${x.set}`);

    Object.entries(grouped).forEach(([groupKey, groupItems]) => {
      const [setName, setCode] = groupKey.split("|||");
      const groupHeader = document.createElement("div");
      groupHeader.className = "empty-state";
      groupHeader.style.gridColumn = "1 / -1";
      groupHeader.innerHTML = `<strong>${escapeHtml(setName || "Unbekanntes Set")}</strong><br><span>${escapeHtml((setCode || "").toUpperCase())}</span>`;
      els.binderGrid.appendChild(groupHeader);

      groupItems.forEach((item) => {
        els.binderGrid.appendChild(createBinderCard(item));
      });
    });
  } else if (group === "type") {
    const grouped = groupBy(items, (x) => getPrimaryCardTypeFromItem(x));

    Object.entries(grouped).forEach(([typeName, groupItems]) => {
      const groupHeader = document.createElement("div");
      groupHeader.className = "empty-state";
      groupHeader.style.gridColumn = "1 / -1";
      groupHeader.innerHTML = `<strong>${escapeHtml(typeName || "Unbekannter Typ")}</strong>`;
      els.binderGrid.appendChild(groupHeader);

      groupItems.forEach((item) => {
        els.binderGrid.appendChild(createBinderCard(item));
      });
    });
  } else {
    items.forEach((item) => {
      els.binderGrid.appendChild(createBinderCard(item));
    });
  }

  updateStats(items);
}

function getPrimaryCardTypeFromItem(item) {
  const typeLine = String(item.typeLine || "").trim();

  if (typeLine) {
    return getPrimaryCardType(typeLine);
  }

  const name = String(item.name || "").toLowerCase();

  if (!name) {
    return "Unbekannt";
  }

  return "Unbekannt";
}

function createBinderCard(item) {
  const node = els.template.content.firstElementChild.cloneNode(true);

  const img = node.querySelector(".binder-card-image");
  const title = node.querySelector(".binder-card-title");
  const setcode = node.querySelector(".binder-card-setcode");
  const cardmarketLink = node.querySelector(".cardmarket-link");
  const info = node.querySelector(".binder-card-info");
  const refreshBtn = node.querySelector(".refresh-btn");
  const editBtn = node.querySelector(".edit-btn");
  const deleteBtn = node.querySelector(".delete-btn");

  img.src = item.imageUrl || "";
  img.alt = item.name;

  title.textContent = item.name;
  setcode.textContent = (item.set || "").toUpperCase();
  cardmarketLink.href = buildCardmarketUrl(item);

  const pills = [];

  if (state.settings.visibleFields.set) {
    pills.push(createInfoPill(`Set: ${item.setName || "-"}`));
  }

  if (state.settings.visibleFields.quantity) {
    pills.push(createInfoPill(`Menge: ${item.quantity}`));
  }

  if (state.settings.visibleFields.condition) {
    pills.push(createInfoPill(`Zustand: ${item.condition}`));
  }

  if (state.settings.visibleFields.finish) {
    pills.push(createInfoPill(`Finish: ${item.finish}`));
  }

  if (state.settings.visibleFields.unitPrice) {
    pills.push(createInfoPill(`Einzelpreis: ${formatCurrency(item.prices?.amount, item.prices?.currency || "EUR")}`));
  }

  if (state.settings.visibleFields.totalPrice) {
    const total = item.prices?.amount != null ? item.prices.amount * item.quantity : null;
    pills.push(createInfoPill(`Gesamt: ${formatCurrency(total, item.prices?.currency || "EUR")}`));
  }

  if (state.settings.visibleFields.updatedAt) {
    const updated = item.prices?.updatedAt ? new Date(item.prices.updatedAt).toLocaleString("de-DE") : "n.a.";
    pills.push(createInfoPill(`Stand: ${updated}`));
  }

  info.innerHTML = pills.join("");

  refreshBtn.addEventListener("click", async () => {
    try {
      refreshBtn.disabled = true;
      const printing = await loadPrintingById(item.cardId);
      item.prices = await fetchPriceForPrinting(printing, item.finish);
      persistBinder();
      renderBinder();
      showToast(`Preis für ${item.name} aktualisiert.`, "success");
    } catch (error) {
      console.error(error);
      showToast(`Preis für ${item.name} konnte nicht aktualisiert werden.`, "error");
    } finally {
      refreshBtn.disabled = false;
    }
  });

  editBtn.addEventListener("click", () => {
    const newQty = prompt(`Neue Menge für ${item.name}`, String(item.quantity));
    if (newQty === null) return;

    const qty = Math.max(1, Number(newQty) || item.quantity);

    const newCondition = prompt(
      `Zustand (NM / EX / GD / LP / PL / PO)`,
      item.condition
    );
    if (newCondition === null) return;

    const newFinish = prompt(
      `Finish (nonfoil / foil / etched)`,
      item.finish
    );
    if (newFinish === null) return;

    item.quantity = qty;
    item.condition = newCondition.trim().toUpperCase();
    item.finish = newFinish.trim().toLowerCase();

    persistBinder();
    renderBinder();

    showToast(`${item.name} wurde aktualisiert.`, "success");
  });

  deleteBtn.addEventListener("click", () => {
    const confirmed = confirm(`${item.name} wirklich löschen?`);
    if (!confirmed) return;

    state.binder = state.binder.filter((x) => x.entryId !== item.entryId);
    persistBinder();
    renderBinder();
    showToast(`${item.name} wurde entfernt.`, "info");
  });

  return node;
}

function createInfoPill(text) {
  return `<span class="info-pill">${escapeHtml(text)}</span>`;
}

async function loadPrintingById(id) {
  const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Karte konnte nicht geladen werden: ${response.status}`);
  }
  return response.json();
}

function updateStats(items) {
  const entryCount = items.length;
  const cardCount = items.reduce((sum, x) => sum + (Number(x.quantity) || 0), 0);

  const totalValueNumber = items.reduce((sum, x) => {
    if (x.prices?.amount == null) return sum;
    return sum + x.prices.amount * x.quantity;
  }, 0);

  els.entryCount.textContent = String(entryCount);
  els.cardCount.textContent = String(cardCount);
  els.totalValue.textContent = formatCurrency(totalValueNumber, "EUR");
}

function sortBinder(a, b, sort) {
  switch (sort) {
    case "name-desc":
      return b.name.localeCompare(a.name);
    case "price-desc":
      return (b.prices?.amount || -1) - (a.prices?.amount || -1);
    case "price-asc":
      return (a.prices?.amount || Number.MAX_SAFE_INTEGER) - (b.prices?.amount || Number.MAX_SAFE_INTEGER);
    case "qty-desc":
      return b.quantity - a.quantity;
    case "set-desc":
      return (b.releasedAt || "").localeCompare(a.releasedAt || "");
    case "name-asc":
    default:
      return a.name.localeCompare(b.name);
  }
}

function groupBy(items, keySelector) {
  return items.reduce((acc, item) => {
    const key = keySelector(item);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});
}

function getPrimaryCardType(typeLine) {
  if (!typeLine) {
    return "Unbekannt";
  }

  const normalized = String(typeLine)
    .replace(/—/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const baseType = normalized.split("-")[0].trim();

  const priorities = [
    "Creature",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Planeswalker",
    "Land",
    "Battle"
  ];

  for (const type of priorities) {
    if (baseType.includes(type)) {
      return type;
    }
  }

  if (baseType.includes("Token")) {
    return "Token";
  }

  return baseType || "Unbekannt";
}

function formatCurrency(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "n.a.";
  }

  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR"
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || "EUR"}`;
  }
}

function loadBinder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistBinder() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.binder));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return cloneDefaultSettings();
    }

    const parsed = JSON.parse(raw);

    return {
      priceSource: parsed.priceSource || defaultSettings.priceSource,
      cardmarketProxyUrl: parsed.cardmarketProxyUrl || defaultSettings.cardmarketProxyUrl,
      visibleFields: {
        set: parsed.visibleFields?.set ?? defaultSettings.visibleFields.set,
        quantity: parsed.visibleFields?.quantity ?? defaultSettings.visibleFields.quantity,
        condition: parsed.visibleFields?.condition ?? defaultSettings.visibleFields.condition,
        finish: parsed.visibleFields?.finish ?? defaultSettings.visibleFields.finish,
        unitPrice: parsed.visibleFields?.unitPrice ?? defaultSettings.visibleFields.unitPrice,
        totalPrice: parsed.visibleFields?.totalPrice ?? defaultSettings.visibleFields.totalPrice,
        updatedAt: parsed.visibleFields?.updatedAt ?? defaultSettings.visibleFields.updatedAt
      }
    };
  } catch {
    return cloneDefaultSettings();
  }
}

function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(defaultSettings));
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function saveSettingsFromDialog() {
  state.settings = {
    priceSource: els.priceSourceSelect.value,
    cardmarketProxyUrl: els.cardmarketProxyInput.value.trim(),
    visibleFields: {
      set: els.showSetToggle.checked,
      quantity: els.showQuantityToggle.checked,
      condition: els.showConditionToggle.checked,
      finish: els.showFinishToggle.checked,
      unitPrice: els.showUnitPriceToggle.checked,
      totalPrice: els.showTotalPriceToggle.checked,
      updatedAt: els.showUpdatedAtToggle.checked
    }
  };

  persistSettings();
  els.settingsDialog.close();
  renderBinder();
  showToast("Settings gespeichert.", "success");
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.binder, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `mtg-binder-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      throw new Error("Ungültige JSON Struktur");
    }

    state.binder = parsed;
    persistBinder();
    renderBinder();
    showToast("Binder importiert.", "success");
  } catch (error) {
    console.error(error);
    showToast("Import fehlgeschlagen.", "error");
  } finally {
    event.target.value = "";
  }
}

function showToast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  els.toastContainer.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 3200);
}

function dedupeBy(items, keySelector) {
  const map = new Map();

  for (const item of items) {
    const key = keySelector(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openQrDialog() {

  document.body.style.overflow = "hidden";

  els.qrDialog.showModal();

  els.qrCode.innerHTML = "";

  new QRCode(els.qrCode, {
    text: window.location.href,
    width: 220,
    height: 220,
    colorDark: "#ffffff",
    colorLight: "#0f1115",
    correctLevel: QRCode.CorrectLevel.H
  });

  els.qrUrl.textContent = window.location.href;

}