const CART_KEY = "marginalia.cart.v1";
const SAVED_KEY = "marginalia.saved.v1";
const ASSISTANT_KEY = "marginalia.assistant.v1";
const ASSISTANT_SESSIONS_KEY = "marginalia.assistant.sessions.v1";
const ACTIVE_ASSISTANT_KEY = "marginalia.assistant.active.v1";
const PALETTE = [
  ["#49635a", "#243c36"], ["#ad684a", "#703f39"], ["#677497", "#354259"],
  ["#9d8050", "#665039"], ["#696d53", "#3c4638"], ["#a85e5f", "#6d3d4a"],
];

const ui = {
  categoryList: document.querySelector("#category-list"),
  filterTabs: document.querySelector("#filter-tabs"),
  grid: document.querySelector("#book-grid"),
  empty: document.querySelector("#empty-results"),
  results: document.querySelector("#results-count"),
  search: document.querySelector("#book-search"),
  sort: document.querySelector("#sort-select"),
  clearFilters: document.querySelector("#clear-filters"),
  wishlist: document.querySelector("#wishlist-toggle"),
  savedCount: document.querySelector("#saved-count"),
  cartCount: document.querySelector("#cart-count"),
  storeView: document.querySelector("#store-view"),
  cartPage: document.querySelector("#cart-page"),
  checkoutPage: document.querySelector("#checkout-page"),
  cartItems: document.querySelector("#cart-items"),
  cartEmpty: document.querySelector("#cart-empty"),
  cartSummary: document.querySelector("#cart-summary"),
  subtotal: document.querySelector("#cart-subtotal"),
  shippingNote: document.querySelector("#shipping-note"),
  checkoutForm: document.querySelector("#checkout-form"),
  checkoutCount: document.querySelector("#checkout-item-count"),
  checkoutTotal: document.querySelector("#checkout-total"),
  checkoutItems: document.querySelector("#checkout-items"),
  checkoutSubtotal: document.querySelector("#checkout-subtotal"),
  checkoutShipping: document.querySelector("#checkout-shipping"),
  cartPageTotal: document.querySelector("#cart-page-total"),
  orderDialog: document.querySelector("#order-dialog"),
  assistantPanel: document.querySelector("#assistant-panel"),
  assistantMessages: document.querySelector("#assistant-messages"),
  assistantHistory: document.querySelector("#assistant-history"),
  assistantHistoryList: document.querySelector("#assistant-history-list"),
  assistantHistoryToggle: document.querySelector("#assistant-history-toggle"),
  assistantNewChat: document.querySelector("#assistant-new-chat"),
  assistantClearChat: document.querySelector("#assistant-clear-chat"),
  assistantClearAll: document.querySelector("#assistant-clear-all"),
  assistantForm: document.querySelector("#assistant-form"),
  assistantInput: document.querySelector("#assistant-input"),
  assistantSend: document.querySelector("#assistant-send"),
  assistantStatus: document.querySelector("#assistant-status"),
  assistantSuggestions: document.querySelector("#assistant-suggestions"),
  assistantModel: document.querySelector("#assistant-model"),
  assistantModelCaption: document.querySelector("#assistant-model-caption"),
  assistantFootnote: document.querySelector("#assistant-footnote"),
  toast: document.querySelector("#toast-region"),
};

let books = [];
let category = "All books";
let showSaved = false;
let cart = loadArray(CART_KEY).filter((item) => item && typeof item.id === "string" && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20);
let saved = new Set(loadArray(SAVED_KEY).filter((id) => typeof id === "string"));
let assistantSessions = loadAssistantSessions();
let activeAssistantSessionId = localStorage.getItem(ACTIVE_ASSISTANT_KEY);
const legacyAssistantHistory = loadArray(ASSISTANT_KEY).filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string").slice(-20);
if (assistantSessions.length === 0 && legacyAssistantHistory.length > 0) {
  const migratedSession = createAssistantSession(legacyAssistantHistory);
  assistantSessions = [migratedSession];
  activeAssistantSessionId = migratedSession.id;
  try {
    localStorage.setItem(ASSISTANT_SESSIONS_KEY, JSON.stringify(assistantSessions));
    localStorage.setItem(ACTIVE_ASSISTANT_KEY, activeAssistantSessionId);
  } catch {
    localStorage.removeItem(ASSISTANT_SESSIONS_KEY);
  }
}
if (!assistantSessions.some((session) => session.id === activeAssistantSessionId)) {
  activeAssistantSessionId = assistantSessions[0]?.id || null;
}
let assistantHistory = [...(assistantSessions.find((session) => session.id === activeAssistantSessionId)?.messages || [])];
let assistantController = null;
let localModels = [];
let localModel = localStorage.getItem("marginalia.local-model") || "";
let searchTimer;
let toastTimer;

function loadArray(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveArray(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    showToast("Browser storage is full. Some changes may not be saved.");
  }
}

function loadAssistantSessions() {
  try {
    const sessions = JSON.parse(localStorage.getItem(ASSISTANT_SESSIONS_KEY) || "[]");
    if (!Array.isArray(sessions)) return [];
    return sessions.filter((session) => session && typeof session.id === "string" && Array.isArray(session.messages))
      .map((session) => ({
        id: session.id,
        title: typeof session.title === "string" ? session.title : "New chat",
        createdAt: Number(session.createdAt) || Date.now(),
        updatedAt: Number(session.updatedAt) || Number(session.createdAt) || Date.now(),
        messages: session.messages.filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string").slice(-20),
      }))
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function createAssistantSession(messages = []) {
  const now = Date.now();
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [...messages],
  };
}

function assistantTitle(messages) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return "New chat";
  const title = firstUserMessage.content.replace(/\s+/g, " ").trim();
  return title.length > 38 ? `${title.slice(0, 38).trimEnd()}…` : title;
}

function persistAssistantSession() {
  if (!activeAssistantSessionId) return;
  const session = assistantSessions.find((item) => item.id === activeAssistantSessionId);
  if (!session) return;
  session.messages = assistantHistory.slice(-20);
  session.title = assistantTitle(session.messages);
  session.updatedAt = Date.now();
  assistantSessions = [session, ...assistantSessions.filter((item) => item.id !== session.id)]
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, 50);
  try {
    localStorage.setItem(ASSISTANT_SESSIONS_KEY, JSON.stringify(assistantSessions));
    localStorage.setItem(ACTIVE_ASSISTANT_KEY, activeAssistantSessionId);
    localStorage.setItem(ASSISTANT_KEY, JSON.stringify(assistantHistory.slice(-20)));
  } catch {
    showToast("Browser storage is full. This chat may not be saved.");
  }
  renderAssistantHistory();
}

function renderAssistantConversation() {
  ui.assistantMessages.replaceChildren();
  appendAssistantMessage("assistant", "Hi, reader. Tell me what you love, what you're in the mood for, or what you're trying to figure out. I'll find a book that feels right.");
  assistantHistory.forEach((message) => appendAssistantMessage(message.role, message.content));
  ui.assistantSuggestions.hidden = assistantHistory.length > 0;
  updateAssistantActions();
}

function updateAssistantActions() {
  ui.assistantClearChat.disabled = assistantHistory.length === 0;
  ui.assistantClearAll.disabled = assistantSessions.length === 0;
}

function renderAssistantHistory() {
  ui.assistantHistoryList.replaceChildren();
  const orderedSessions = [...assistantSessions].sort((first, second) => second.updatedAt - first.updatedAt);
  if (orderedSessions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "assistant-history-empty";
    empty.textContent = "Your saved chats will appear here.";
    ui.assistantHistoryList.append(empty);
    updateAssistantActions();
    return;
  }

  orderedSessions.forEach((session) => {
    const row = document.createElement("div");
    row.className = `assistant-history-row${session.id === activeAssistantSessionId ? " active" : ""}`;
    const open = document.createElement("button");
    open.className = "assistant-history-open";
    open.type = "button";
    open.textContent = session.title;
    open.title = session.title;
    open.setAttribute("aria-current", String(session.id === activeAssistantSessionId));
    open.addEventListener("click", () => selectAssistantSession(session.id));
    const date = document.createElement("span");
    date.className = "assistant-history-date";
    date.textContent = new Date(session.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" });
    const remove = document.createElement("button");
    remove.className = "assistant-history-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Delete chat";
    remove.setAttribute("aria-label", `Delete chat: ${session.title}`);
    remove.addEventListener("click", () => deleteAssistantSession(session.id));
    row.append(open, date, remove);
    ui.assistantHistoryList.append(row);
  });
  updateAssistantActions();
}

function selectAssistantSession(sessionId) {
  const session = assistantSessions.find((item) => item.id === sessionId);
  if (!session) return;
  assistantController?.abort();
  activeAssistantSessionId = session.id;
  assistantHistory = [...session.messages];
  try {
    localStorage.setItem(ACTIVE_ASSISTANT_KEY, session.id);
    localStorage.setItem(ASSISTANT_KEY, JSON.stringify(assistantHistory));
  } catch {
    showToast("Browser storage is full. This chat may not be saved.");
  }
  ui.assistantHistory.hidden = true;
  ui.assistantHistoryToggle.setAttribute("aria-expanded", "false");
  renderAssistantConversation();
  renderAssistantHistory();
  ui.assistantInput.focus();
}

function startAssistantSession() {
  assistantController?.abort();
  activeAssistantSessionId = null;
  assistantHistory = [];
  ui.assistantInput.value = "";
  ui.assistantInput.style.height = "auto";
  ui.assistantHistory.hidden = true;
  ui.assistantHistoryToggle.setAttribute("aria-expanded", "false");
  try {
    localStorage.removeItem(ACTIVE_ASSISTANT_KEY);
    localStorage.removeItem(ASSISTANT_KEY);
  } catch {
    showToast("Could not update browser storage.");
  }
  renderAssistantConversation();
  renderAssistantHistory();
  ui.assistantInput.focus();
}

function clearCurrentAssistantSession() {
  if (!assistantHistory.length || !window.confirm("Clear this chat from your history?")) return;
  assistantController?.abort();
  assistantSessions = assistantSessions.filter((session) => session.id !== activeAssistantSessionId);
  try {
    localStorage.setItem(ASSISTANT_SESSIONS_KEY, JSON.stringify(assistantSessions));
  } catch {
    showToast("Could not update browser storage.");
  }
  startAssistantSession();
}

function clearAllAssistantSessions() {
  if (!assistantSessions.length || !window.confirm("Delete all saved AiAssistant chats? This cannot be undone.")) return;
  assistantController?.abort();
  assistantSessions = [];
  activeAssistantSessionId = null;
  assistantHistory = [];
  try {
    localStorage.removeItem(ASSISTANT_SESSIONS_KEY);
    localStorage.removeItem(ACTIVE_ASSISTANT_KEY);
    localStorage.removeItem(ASSISTANT_KEY);
  } catch {
    showToast("Could not clear browser storage.");
  }
  ui.assistantHistory.hidden = true;
  ui.assistantHistoryToggle.setAttribute("aria-expanded", "false");
  renderAssistantConversation();
  renderAssistantHistory();
}

function deleteAssistantSession(sessionId) {
  assistantSessions = assistantSessions.filter((session) => session.id !== sessionId);
  if (activeAssistantSessionId === sessionId) {
    assistantController?.abort();
    activeAssistantSessionId = null;
    assistantHistory = [];
    try {
      localStorage.removeItem(ACTIVE_ASSISTANT_KEY);
      localStorage.removeItem(ASSISTANT_KEY);
    } catch {
      showToast("Could not update browser storage.");
    }
    renderAssistantConversation();
  }
  try {
    localStorage.setItem(ASSISTANT_SESSIONS_KEY, JSON.stringify(assistantSessions));
  } catch {
    showToast("Could not update browser storage.");
  }
  renderAssistantHistory();
}

function safe(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function money(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  ui.toast.replaceChildren(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 3200);
}

function visibleBooks() {
  const query = ui.search.value.trim().toLocaleLowerCase();
  let result = books.filter((book) => {
    const matchesCategory = category === "All books" || book.category === category;
    const matchesQuery = !query || `${book.title} ${book.author} ${book.category} ${book.description}`.toLocaleLowerCase().includes(query);
    const matchesSaved = !showSaved || saved.has(book.id);
    return matchesCategory && matchesQuery && matchesSaved;
  });
  if (ui.sort.value === "price-asc") result = result.toSorted((a, b) => a.price - b.price);
  if (ui.sort.value === "price-desc") result = result.toSorted((a, b) => b.price - a.price);
  if (ui.sort.value === "rating") result = result.toSorted((a, b) => b.rating - a.rating);
  return result;
}

function renderCategories(categories) {
  const allCategories = ["All books", ...categories];
  ui.categoryList.replaceChildren(...allCategories.map((item) => {
    const button = document.createElement("button");
    button.className = `category-link${item === category ? " active" : ""}`;
    button.type = "button";
    button.textContent = item;
    button.addEventListener("click", () => setCategory(item));
    return button;
  }));
  ui.filterTabs.replaceChildren(...allCategories.map((item) => {
    const button = document.createElement("button");
    button.className = `filter-chip${item === category ? " active" : ""}`;
    button.type = "button";
    button.textContent = item;
    button.setAttribute("aria-pressed", String(item === category));
    button.addEventListener("click", () => setCategory(item));
    return button;
  }));
}

function setCategory(value) {
  category = value;
  showSaved = false;
  ui.wishlist.setAttribute("aria-pressed", "false");
  renderCategories([...new Set(books.map((book) => book.category))].sort());
  renderBooks();
}

function renderBooks() {
  const visible = visibleBooks();
  ui.results.textContent = `${visible.length} ${visible.length === 1 ? "book" : "books"}${ui.search.value ? " found" : " on the shelves"}`;
  ui.empty.hidden = visible.length !== 0;
  ui.grid.hidden = visible.length === 0;
  ui.clearFilters.hidden = !ui.search.value && category === "All books" && !showSaved;
  ui.grid.replaceChildren(...visible.map((book, index) => createBookCard(book, index)));
  ui.savedCount.textContent = String(saved.size);
}

function bookCoverMarkup(book, index, sizeClass = "") {
  const [colorTop, colorBottom] = PALETTE[index % PALETTE.length];
  const series = book.category === "Science Fiction" ? "FARTHER WORLDS" : book.category === "Fantasy" ? "MYTH & MAGIC" : "KK BOOK STORE EDITIONS";
  const number = String(index + 1).padStart(2, "0");
  return `<div class="book-object ${sizeClass}" style="--cover-top:${colorTop};--cover-bottom:${colorBottom}">
    <span class="book-pages" aria-hidden="true"></span><span class="book-spine" aria-hidden="true"></span>
    <div class="cover-face"><span class="cover-imprint">${safe(series)}</span><span class="cover-motif" aria-hidden="true"><i></i><i></i><i></i></span><strong>${safe(book.title)}</strong><span class="cover-author">${safe(book.author.toUpperCase())}</span><span class="cover-number">${number} · MMXXV</span></div>
  </div>`;
}

function createBookCard(book, index) {
  const article = document.createElement("article");
  article.className = "book-card";
  article.style.animationDelay = `${Math.min(index, 8) * 35}ms`;
  article.innerHTML = `
    <div class="cover-stage" role="img" aria-label="${safe(book.title)} by ${safe(book.author)} book cover">
      ${bookCoverMarkup(book, index)}
      <span class="book-badge">${safe(book.badge)}</span>
      <button class="favorite-button" type="button" data-action="favorite" data-id="${safe(book.id)}" aria-label="${saved.has(book.id) ? "Remove" : "Save"} ${safe(book.title)}" aria-pressed="${saved.has(book.id)}">${saved.has(book.id) ? "♥" : "♡"}</button>
      <button class="quick-add" type="button" data-action="add" data-id="${safe(book.id)}">Add to bag · ${money(book.price)}</button>
    </div>
    <div class="book-info">
      <span class="book-category">${safe(book.category)}</span>
      <div class="book-title-row"><h3 class="book-title" title="${safe(book.title)}"><button class="book-detail-trigger" type="button" data-action="details" data-id="${safe(book.id)}">${safe(book.title)}</button></h3><span class="book-price">${money(book.price)}</span></div>
      <p class="book-author">by ${safe(book.author)}</p>
      <div class="book-rating"><span aria-label="${book.rating} out of 5 stars">★★★★★</span><span>${book.rating.toFixed(1)} (${book.reviews.toLocaleString()})</span></div>
    </div>`;
  return article;
}

function openBookDetails(id) {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  const dialog = document.querySelector("#book-details-dialog");
  document.querySelector("#book-details-content").innerHTML = `
    <div class="details-cover-wrap">${bookCoverMarkup(book, books.indexOf(book), "details-book-object")}</div>
    <div class="details-copy">
      <button class="icon-close details-close" type="button" aria-label="Close book details">×</button>
      <span class="section-eyebrow">${safe(book.category)}</span>
      <h2 id="book-details-title">${safe(book.title)}</h2>
      <p class="details-author">by ${safe(book.author)}</p>
      <p class="details-rating">★★★★★ &nbsp; ${book.rating.toFixed(1)} · ${book.reviews.toLocaleString()} reader reviews</p>
      <p class="details-description">${safe(book.description)}</p>
      <span class="details-isbn">ISBN ${safe(book.isbn)}</span>
      <button class="details-buy" type="button" data-action="add" data-id="${safe(book.id)}">Add to bag <span>${money(book.price)}</span></button>
    </div>`;
  dialog.querySelector(".details-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".details-buy").addEventListener("click", () => {
    addToCart(id);
    dialog.close();
  });
  dialog.showModal();
}

function renderCart() {
  const lineItems = cart.map((line) => ({ ...line, book: books.find((book) => book.id === line.id) })).filter((line) => line.book);
  cart = lineItems.map(({ id, quantity }) => ({ id, quantity }));
  const quantity = cart.reduce((total, line) => total + line.quantity, 0);
  const subtotal = lineItems.reduce((total, line) => total + line.book.price * line.quantity, 0);
  const shipping = subtotal >= 50 ? 0 : 4.95;
  ui.cartCount.textContent = String(quantity);
  ui.cartEmpty.hidden = quantity > 0;
  ui.cartSummary.hidden = quantity === 0;
  ui.cartItems.replaceChildren(...lineItems.map(({ book, quantity: amount }) => {
    const row = document.createElement("article");
    row.className = "cart-line";
    row.innerHTML = `
      <div class="cart-line-art" aria-hidden="true"><span>${safe(book.title.slice(0, 1))}</span></div>
      <div class="cart-line-info"><span class="book-category">${safe(book.category)}</span><h3>${safe(book.title)}</h3><p>${safe(book.author)} · ${money(book.price)}</p>
        <div class="quantity-control"><button type="button" data-action="decrease" data-id="${safe(book.id)}" aria-label="Decrease ${safe(book.title)} quantity">−</button><span>${amount}</span><button type="button" data-action="increase" data-id="${safe(book.id)}" aria-label="Increase ${safe(book.title)} quantity">+</button></div>
      </div><div class="cart-line-end"><strong>${money(book.price * amount)}</strong><button class="remove-item" type="button" data-action="remove" data-id="${safe(book.id)}">Remove</button></div>`;
    return row;
  }));
  ui.subtotal.textContent = money(subtotal);
  ui.shippingNote.textContent = shipping === 0 ? "Lovely. Your shipping is on us." : `Add ${money(50 - subtotal)} for complimentary shipping.`;
  ui.cartPageTotal.textContent = money(subtotal + shipping);
  ui.checkoutCount.textContent = `${quantity} ${quantity === 1 ? "book" : "books"}`;
  ui.checkoutSubtotal.textContent = money(subtotal);
  ui.checkoutShipping.textContent = shipping === 0 ? "Complimentary" : money(shipping);
  ui.checkoutTotal.textContent = money(subtotal + shipping);
  ui.checkoutItems.replaceChildren(...lineItems.map(({ book, quantity: amount }) => {
    const row = document.createElement("div");
    row.className = "checkout-item";
    row.innerHTML = `<span>${amount} × ${safe(book.title)}</span><strong>${money(book.price * amount)}</strong>`;
    return row;
  }));
  saveArray(CART_KEY, cart);
}

function addToCart(id) {
  const item = cart.find((line) => line.id === id);
  if (item) {
    if (item.quantity >= 20) return showToast("That's the maximum quantity for one title.");
    item.quantity += 1;
  } else {
    cart.push({ id, quantity: 1 });
  }
  renderCart();
  const book = books.find((entry) => entry.id === id);
  showToast(`${book.title} added to your bag.`);
}

function updateCart(id, action) {
  const item = cart.find((line) => line.id === id);
  if (!item) return;
  if (action === "increase" && item.quantity < 20) item.quantity += 1;
  if (action === "decrease") item.quantity -= 1;
  if (action === "remove" || item.quantity <= 0) cart = cart.filter((line) => line.id !== id);
  renderCart();
}

function renderRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const isCart = path === "/cart";
  const isCheckout = path === "/checkout";
  ui.storeView.hidden = isCart || isCheckout;
  ui.cartPage.hidden = !isCart;
  ui.checkoutPage.hidden = !isCheckout;
  if (isCheckout && cart.length === 0 && books.length) {
    navigate("/cart", false);
    return;
  }
  document.title = isCart ? "Your Bag | KK Book Store" : isCheckout ? "Checkout | KK Book Store" : "KK Book Store | Find your next favorite";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function navigate(path, push = true) {
  if (push && window.location.pathname !== path) window.history.pushState({}, "", path);
  renderRoute();
}

function toggleAssistant(force) {
  const open = force ?? !ui.assistantPanel.classList.contains("open");
  ui.assistantPanel.classList.toggle("open", open);
  ui.assistantPanel.setAttribute("aria-hidden", String(!open));
  document.querySelector("#assistant-launcher").setAttribute("aria-expanded", String(open));
  if (open) setTimeout(() => ui.assistantInput.focus(), 100);
}

function appendAssistantMessage(role, content, { streaming = false, error = false } = {}) {
  const article = document.createElement("article");
  article.className = `assistant-message ${role === "user" ? "user" : "assistant-reply"}${error ? " error" : ""}`;
  const paragraph = document.createElement("p");
  paragraph.textContent = content;
  article.append(paragraph);
  if (streaming) {
    const caret = document.createElement("span");
    caret.className = "assistant-caret";
    caret.setAttribute("aria-hidden", "true");
    article.append(caret);
  }
  ui.assistantMessages.append(article);
  ui.assistantMessages.scrollTop = ui.assistantMessages.scrollHeight;
  return { article, paragraph };
}

function updateAssistantStatus() {
  ui.assistantStatus.textContent = localModels.length
    ? `On this device · ${ui.assistantModel.value}`
    : "Ollama is not running";
}

async function sendAssistant(text = ui.assistantInput.value) {
  const content = text.trim();
  if (!content || assistantController) return;
  if (!activeAssistantSessionId || !assistantSessions.some((session) => session.id === activeAssistantSessionId)) {
    const session = createAssistantSession();
    activeAssistantSessionId = session.id;
    assistantSessions.unshift(session);
  }
  const requestSessionId = activeAssistantSessionId;
  ui.assistantSuggestions.hidden = true;
  appendAssistantMessage("user", content);
  ui.assistantInput.value = "";
  ui.assistantInput.style.height = "auto";
  assistantHistory.push({ role: "user", content });
  assistantHistory = assistantHistory.slice(-20);
  const requestHistory = [...assistantHistory];
  persistAssistantSession();
  assistantController = new AbortController();
  ui.assistantSend.disabled = true;
  ui.assistantStatus.textContent = "Thinking on this device…";
  const answer = appendAssistantMessage("assistant", "", { streaming: true });
  let hasError = false;
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages: requestHistory, model: ui.assistantModel.value }),
      signal: assistantController.signal,
    });
    if (!response.ok || !response.body) throw new Error("The assistant couldn't start. Please try again.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        const data = event.split("\n").find((line) => line.startsWith("data: "));
        if (!data) continue;
        const payload = JSON.parse(data.slice(6));
        if (payload.type === "token") answer.paragraph.textContent += payload.content;
        if (payload.type === "error") {
          answer.paragraph.textContent = payload.message;
          answer.article.classList.add("error");
          hasError = true;
          finished = true;
        }
        if (payload.type === "done") finished = true;
        ui.assistantMessages.scrollTop = ui.assistantMessages.scrollHeight;
      }
    }
    answer.article.querySelector(".assistant-caret")?.remove();
    if (answer.paragraph.textContent && !hasError && activeAssistantSessionId === requestSessionId) {
      assistantHistory = [...requestHistory, { role: "assistant", content: answer.paragraph.textContent }].slice(-20);
      persistAssistantSession();
    } else if (!hasError) {
      answer.paragraph.textContent = "I couldn't find the words that time. Try me again?";
      answer.article.classList.add("error");
    }
  } catch (error) {
    answer.article.querySelector(".assistant-caret")?.remove();
    if (error.name !== "AbortError") {
      answer.paragraph.textContent = error.message || "Something went wrong. Please try again.";
      answer.article.classList.add("error");
    }
  } finally {
    assistantController = null;
    ui.assistantSend.disabled = false;
    updateAssistantStatus();
    ui.assistantMessages.scrollTop = ui.assistantMessages.scrollHeight;
  }
}

async function loadLocalModels() {
  try {
    const localResponse = await fetch("/api/local/models", { cache: "no-store" });
    const local = await localResponse.json();
    localModels = localResponse.ok && Array.isArray(local.models) ? local.models : [];
    const preferredModel = localModels.includes(localModel) ? localModel : (local.default || localModels[0] || "");
    if (preferredModel && localModels.includes(preferredModel)) localModel = preferredModel;
    const models = localModels.length ? localModels : ["No local models found"];
    ui.assistantModel.replaceChildren(...models.map((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      return option;
    }));
    if (localModel && localModels.includes(localModel)) ui.assistantModel.value = localModel;
    ui.assistantModel.disabled = localModels.length === 0;
    ui.assistantModelCaption.textContent = "MODEL ON THIS DEVICE";
    ui.assistantModel.setAttribute("aria-label", "Choose local Ollama model");
    ui.assistantInput.placeholder = "Ask your local model…";
    ui.assistantFootnote.textContent = "Runs on this computer. No internet or API key needed.";
    updateAssistantStatus();
  } catch {
    localModels = [];
    ui.assistantModel.replaceChildren(new Option("Ollama unavailable", ""));
    ui.assistantModel.disabled = true;
    ui.assistantStatus.textContent = "Ollama is not running";
  }
}

async function placeOrder(event) {
  event.preventDefault();
  const form = new FormData(ui.checkoutForm);
  const payload = Object.fromEntries(["name", "email", "address", "city", "postal_code"].map((key) => [key, form.get(key).trim()]));
  payload.items = cart.map(({ id, quantity }) => ({ book_id: id, quantity }));
  const submit = ui.checkoutForm.querySelector(".checkout-submit");
  submit.disabled = true;
  submit.firstChild.textContent = "Placing your order…";
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "We couldn't place the order. Please check your details and try again.");
    const itemSummary = data.items.map((item) => `${item.quantity} × ${item.title}`).join(", ");
    document.querySelector("#order-reference").textContent = `Order ${data.order_id} · ${new Date(data.created_at).toLocaleDateString()}`;
    document.querySelector("#order-summary").textContent = `${itemSummary}. Total ${money(data.total)}${data.shipping ? ` including ${money(data.shipping)} shipping` : " with complimentary shipping"}. This prototype records orders but does not collect payment or send email.`;
    cart = [];
    saveArray(CART_KEY, cart);
    renderCart();
    ui.checkoutForm.reset();
    navigate("/");
    ui.orderDialog.showModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Place my order <span aria-hidden="true">→</span>';
  }
}

function wireEvents() {
  ui.grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "add") addToCart(button.dataset.id);
    if (button.dataset.action === "details") openBookDetails(button.dataset.id);
    if (button.dataset.action === "favorite") {
      if (saved.has(button.dataset.id)) saved.delete(button.dataset.id);
      else saved.add(button.dataset.id);
      saveArray(SAVED_KEY, [...saved]);
      renderBooks();
    }
  });
  ui.cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) updateCart(button.dataset.id, button.dataset.action);
  });
  ui.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderBooks, 100);
  });
  document.querySelector("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
    renderBooks();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      ui.search.focus();
    }
    if (event.key === "Escape") {
      toggleAssistant(false);
    }
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-route]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.dataset.route);
  });
  window.addEventListener("popstate", () => renderRoute());
  ui.sort.addEventListener("change", renderBooks);
  ui.clearFilters.addEventListener("click", () => {
    ui.search.value = "";
    setCategory("All books");
  });
  document.querySelector("#reset-search").addEventListener("click", () => {
    ui.search.value = "";
    setCategory("All books");
  });
  ui.wishlist.addEventListener("click", () => {
    showSaved = !showSaved;
    category = "All books";
    ui.wishlist.setAttribute("aria-pressed", String(showSaved));
    renderCategories([...new Set(books.map((book) => book.category))].sort());
    renderBooks();
    if (showSaved) document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
  });
  document.querySelector("#cart-trigger").addEventListener("click", () => navigate("/cart"));
  document.querySelector("#checkout-trigger").addEventListener("click", () => navigate("/checkout"));
  ui.checkoutForm.addEventListener("submit", placeOrder);
  document.querySelector("#order-done").addEventListener("click", () => {
    ui.orderDialog.close();
    navigate("/");
  });
  document.querySelector("#assistant-launcher").addEventListener("click", () => toggleAssistant());
  document.querySelector("#assistant-close").addEventListener("click", () => toggleAssistant(false));
  document.querySelector("#ask-assistant").addEventListener("click", () => toggleAssistant(true));
  ui.assistantNewChat.addEventListener("click", startAssistantSession);
  ui.assistantHistoryToggle.addEventListener("click", () => {
    const open = ui.assistantHistory.hidden;
    ui.assistantHistory.hidden = !open;
    ui.assistantHistoryToggle.setAttribute("aria-expanded", String(open));
    if (open) renderAssistantHistory();
  });
  ui.assistantClearChat.addEventListener("click", clearCurrentAssistantSession);
  ui.assistantClearAll.addEventListener("click", clearAllAssistantSessions);
  ui.assistantModel.addEventListener("change", () => {
    if (localModels.includes(ui.assistantModel.value)) {
      localModel = ui.assistantModel.value;
      localStorage.setItem("marginalia.local-model", localModel);
    }
    updateAssistantStatus();
  });
  ui.assistantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendAssistant();
  });
  ui.assistantInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      ui.assistantForm.requestSubmit();
    }
  });
  ui.assistantInput.addEventListener("input", () => {
    ui.assistantInput.style.height = "auto";
    ui.assistantInput.style.height = `${Math.min(ui.assistantInput.scrollHeight, 95)}px`;
  });
  ui.assistantSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) sendAssistant(button.textContent);
  });
  document.querySelector("#newsletter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const email = document.querySelector("#newsletter-email").value.trim();
    const button = formElement.querySelector("button");
    button.disabled = true;
    fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail?.[0]?.msg || "We couldn't save your signup. Please try again.");
      document.querySelector("#newsletter-response").textContent = "Signup saved. Newsletter delivery is not configured in this prototype.";
      formElement.reset();
    }).catch((error) => showToast(error.message)).finally(() => { button.disabled = false; });
  });
}

async function init() {
  document.querySelector("#year").textContent = String(new Date().getFullYear());
  wireEvents();
  renderAssistantConversation();
  renderAssistantHistory();
  await loadLocalModels();
  try {
    const response = await fetch("/api/books");
    if (!response.ok) throw new Error("Catalog could not be loaded");
    const data = await response.json();
    books = data.books;
    renderCategories(data.categories);
    renderBooks();
    renderCart();
    renderRoute();
  } catch {
    ui.results.textContent = "The shelves are temporarily unavailable";
    showToast("We couldn't load the bookshop. Please refresh and try again.");
  }
}

init();
