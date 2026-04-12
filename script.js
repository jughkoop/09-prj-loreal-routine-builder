/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelections");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

const STORAGE_KEY = "selectedProductIds";
const WORKER_API_URL =
  "https://loreal-routine-builder.44daniellee.workers.dev/";

let allProducts = [];
let currentDisplayedProducts = [];
let selectedProductIds = new Set(loadSelectedProductIds());
let routineGenerated = false;

/* Keep full conversation history so follow-up answers stay relevant */
const conversationMessages = [
  {
    role: "system",
    content:
      "You are a beginner-friendly beauty routine assistant. Keep responses focused on the generated routine, skincare, haircare, makeup, fragrance, and related beauty topics. If a question is unrelated to these topics, politely refuse and ask for a beauty-related question. Use clear steps and simple language.",
  },
];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

appendChatMessage(
  "assistant",
  "Choose products from a category, then click Generate Routine.",
);

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Read selected product IDs from localStorage */
function loadSelectedProductIds() {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((id) => Number.isInteger(id));
  } catch (error) {
    return [];
  }
}

/* Save selected product IDs to localStorage */
function saveSelectedProductIds() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Array.from(selectedProductIds)),
  );
}

/* Return product objects for currently selected IDs */
function getSelectedProducts() {
  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

/* Add a message bubble to the chat window */
function appendChatMessage(role, content) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}-message`;
  messageElement.textContent = content;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Create product cards and attach interactions */
function displayProducts(products) {
  currentDisplayedProducts = products;

  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found in this category.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const selectedClass = selectedProductIds.has(product.id)
        ? "product-card selected"
        : "product-card";

      return `
        <article
          class="${selectedClass}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${selectedProductIds.has(product.id)}"
          aria-label="Select ${product.name}"
        >
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
            <button
              type="button"
              class="toggle-description"
              aria-expanded="false"
              aria-controls="description-${product.id}"
            >
              Show description
            </button>
            <p id="description-${product.id}" class="product-description" hidden>
              ${product.description}
            </p>
          </div>
        </article>
      `;
    })
    .join("");

  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".toggle-description")) {
        return;
      }

      const productId = Number(card.dataset.productId);
      toggleProductSelection(productId);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      if (event.target.closest(".toggle-description")) {
        return;
      }

      event.preventDefault();
      const productId = Number(card.dataset.productId);
      toggleProductSelection(productId);
    });
  });

  const descriptionButtons = productsContainer.querySelectorAll(
    ".toggle-description",
  );
  descriptionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const card = event.target.closest(".product-card");
      const description = card.querySelector(".product-description");
      const isExpanded = button.getAttribute("aria-expanded") === "true";

      button.setAttribute("aria-expanded", String(!isExpanded));
      button.textContent = isExpanded ? "Show description" : "Hide description";
      description.hidden = isExpanded;
    });
  });
}

/* Add or remove a product ID, then refresh both sections */
function toggleProductSelection(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelectedProductIds();
  renderSelectedProducts();
  displayProducts(currentDisplayedProducts);
}

/* Render selected products with individual remove buttons */
function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="selected-placeholder">No products selected yet.</p>';
    generateRoutineButton.disabled = true;
    clearSelectionsButton.disabled = true;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-item">
          <span>${product.name} (${product.brand})</span>
          <button
            type="button"
            class="remove-selected-btn"
            data-remove-id="${product.id}"
            aria-label="Remove ${product.name} from selected products"
          >
            Remove
          </button>
        </div>
      `,
    )
    .join("");

  generateRoutineButton.disabled = false;
  clearSelectionsButton.disabled = false;

  const removeButtons = selectedProductsList.querySelectorAll(
    ".remove-selected-btn",
  );
  removeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const idToRemove = Number(button.dataset.removeId);
      selectedProductIds.delete(idToRemove);
      saveSelectedProductIds();
      renderSelectedProducts();
      displayProducts(currentDisplayedProducts);
    });
  });
}

/* Send messages to OpenAI and return the assistant text */
async function getOpenAIResponse(messages) {
  const response = await fetch(WORKER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || "Worker request failed.";
    throw new Error(errorMessage);
  }

  /* Accept either OpenAI-style response or a simplified worker response shape */
  if (typeof data.reply === "string" && data.reply.trim()) {
    return data.reply;
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No response text returned by the worker.");
  }

  return content;
}

/* Build JSON payload with only the fields needed for routine creation */
function buildSelectedProductsPayload() {
  const selectedProducts = getSelectedProducts();

  return selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));
}

/* Generate a routine using selected products */
generateRoutineButton.addEventListener("click", async () => {
  const selectedProductsPayload = buildSelectedProductsPayload();

  if (selectedProductsPayload.length === 0) {
    appendChatMessage("assistant", "Please select at least one product first.");
    return;
  }

  generateRoutineButton.disabled = true;
  appendChatMessage("assistant", "Generating your personalized routine...");

  const routinePrompt = `Create a personalized beauty routine using only these selected products. Keep it simple for beginners and use clear sections. Include when to use each product and any beginner-safe tips.\n\nSelected products JSON:\n${JSON.stringify(
    selectedProductsPayload,
    null,
    2,
  )}`;

  const messagesForRequest = [
    ...conversationMessages,
    { role: "user", content: routinePrompt },
  ];

  try {
    const routineText = await getOpenAIResponse(messagesForRequest);

    conversationMessages.push({ role: "user", content: routinePrompt });
    conversationMessages.push({ role: "assistant", content: routineText });

    routineGenerated = true;
    appendChatMessage("assistant", routineText);
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
  } finally {
    generateRoutineButton.disabled = false;
  }
});

/* Follow-up questions after routine generation */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();
  if (!question) {
    return;
  }

  appendChatMessage("user", question);
  userInput.value = "";

  if (!routineGenerated) {
    appendChatMessage(
      "assistant",
      "Please generate a routine first, then ask follow-up questions.",
    );
    return;
  }

  const messagesForRequest = [
    ...conversationMessages,
    { role: "user", content: question },
  ];

  try {
    const assistantReply = await getOpenAIResponse(messagesForRequest);

    conversationMessages.push({ role: "user", content: question });
    conversationMessages.push({ role: "assistant", content: assistantReply });

    appendChatMessage("assistant", assistantReply);
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
  }
});

/* Clear all selected products at once */
clearSelectionsButton.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelectedProductIds();
  renderSelectedProducts();
  displayProducts(currentDisplayedProducts);
});

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", (event) => {
  const selectedCategory = event.target.value;

  /* filter() creates a new array containing only products
     where the category matches what the user selected */
  const filteredProducts = allProducts.filter(
    (product) => product.category === selectedCategory,
  );

  displayProducts(filteredProducts);
});

/* Initial app setup */
async function initializeApp() {
  allProducts = await loadProducts();
  renderSelectedProducts();
}

initializeApp();
