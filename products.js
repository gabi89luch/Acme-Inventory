// products.js - XML parsing & rendering for the Product Inventory page
(function () {
  "use strict";

  const XML_URL = "products.xml";
  const CODE_PATTERN = /^\d{3}-\d{2}$/;
  let products = [];
  let xmlDoc = null;

  const CATEGORY_IMAGE = {
    "Electronics": "images/electronics.jpg",
    "Office Supplies": "images/office.jpg",
    "Furniture": "images/furniture.jpg",
    "Networking": "images/networking.jpg",
  };

  const els = {
    status: document.getElementById("loadStatus"),
    table: document.getElementById("productTable"),
    body: document.getElementById("productBody"),
    empty: document.getElementById("emptyState"),
    searchForm: document.getElementById("searchForm"),
    searchCode: document.getElementById("searchCode"),
    searchBtn: document.getElementById("searchBtn"),
    clearBtn: document.getElementById("clearBtn"),
    searchResult: document.getElementById("searchResult"),
    categoryFilter: document.getElementById("categoryFilter"),
    nameFilter: document.getElementById("nameFilter"),
  };

  async function loadProducts() {
    try {
      // Prefer the real XML file. If the page was opened directly from disk
      // (file://), browsers block fetch() of local files, so fall back to the
      // embedded copy generated from products.xml.
      let text;
      let usedFallback = false;
      try {
        const res = await fetch(XML_URL);
        if (!res.ok) throw new Error("HTTP " + res.status);
        text = await res.text();
      } catch (fetchErr) {
        if (!window.PRODUCTS_XML_FALLBACK) throw fetchErr;
        text = window.PRODUCTS_XML_FALLBACK;
        usedFallback = true;
        console.info(
          "products.xml could not be fetched (" + fetchErr.message + "); using the embedded copy. " +
          "Serve the folder over HTTP to read products.xml directly."
        );
      }

      const doc = new DOMParser().parseFromString(text, "application/xml");
      const parseError = doc.querySelector("parsererror");
      if (parseError) throw new Error("Invalid XML: " + parseError.textContent);
      xmlDoc = doc;

      const nodes = doc.querySelectorAll("product");
      products = Array.from(nodes).map(parseProduct).filter(Boolean);

      if (products.length === 0) throw new Error("No products found in XML.");

      els.status.className = "mb-4 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200";
      els.status.textContent = "Loaded " + products.length + " products from products.xml." +
        (usedFallback ? " (embedded copy - local file mode)" : "");
      populateCategories();
      renderTable();
    } catch (err) {
      console.error(err);
      els.status.className = "mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-800 border border-red-200";
      els.status.textContent = "Failed to load products: " + err.message;
    }
  }

  function parseProduct(node) {
    const code = node.getAttribute("code");
    const get = (tag) => {
      const el = node.querySelector(tag);
      return el ? el.textContent.trim() : "";
    };
    // Validate data types per the specification:
    // code must match ###-##, quantity an integer >= 0, unitPrice a decimal >= 0.00.
    if (!CODE_PATTERN.test(code)) {
      console.warn("Skipping product with invalid code format (expected ###-##):", code || "(missing)");
      return null;
    }
    const name = get("name");
    if (!name) {
      console.warn("Skipping product with missing name:", code);
      return null;
    }
    const quantity = parseInt(get("quantity"), 10);
    const unitPrice = parseFloat(get("unitPrice"));
    if (!Number.isInteger(quantity) || quantity < 0) {
      console.warn("Skipping product with invalid quantity (expected integer >= 0):", code);
      return null;
    }
    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      console.warn("Skipping product with invalid unitPrice (expected decimal >= 0.00):", code);
      return null;
    }
    return {
      code: code,
      category: get("category"),
      name: name,
      description: get("description"),
      quantity: quantity,
      unitPrice: unitPrice,
    };
  }

  function populateCategories() {
    const cats = [...new Set(products.map((p) => p.category))].sort();
    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      els.categoryFilter.appendChild(opt);
    });
  }

  function stockBadge(p) {
    if (p.quantity === 0) return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Out of stock</span>';
    if (p.quantity < 10) return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Low stock</span>';
    return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">In stock</span>';
  }

  function renderTable() {
    const cat = els.categoryFilter.value;
    const nameQ = els.nameFilter.value.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (nameQ && !p.name.toLowerCase().includes(nameQ)) return false;
      return true;
    });

    els.body.innerHTML = "";
    if (filtered.length === 0) {
      els.table.classList.add("hidden");
      els.empty.classList.remove("hidden");
      return;
    }
    els.empty.classList.add("hidden");
    els.table.classList.remove("hidden");

    const frag = document.createDocumentFragment();
    filtered.forEach((p) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 transition";
      const img = CATEGORY_IMAGE[p.category] || "images/electronics.jpg";
      tr.innerHTML = `
        <td class="px-4 py-3 font-mono text-xs font-semibold text-slate-700">${escapeHtml(p.code)}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <img src="${img}" alt="${escapeHtml(p.category)}" class="product-img">
            <span class="font-medium">${escapeHtml(p.name)}</span>
          </div>
        </td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(p.category)}</td>
        <td class="px-4 py-3 text-slate-500 max-w-xs truncate" title="${escapeHtml(p.description)}">${escapeHtml(p.description)}</td>
        <td class="px-4 py-3">${p.quantity}</td>
        <td class="px-4 py-3 font-semibold">&euro;${p.unitPrice.toFixed(2)}</td>
        <td class="px-4 py-3">${stockBadge(p)}</td>
      `;
      frag.appendChild(tr);
    });
    els.body.appendChild(frag);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Look up a product by code using an XPath query against the loaded XML document.
  // (XPath demonstrates parsing skills beyond the basic DOM traversal used in class.)
  function findByCodeXPath(code) {
    if (!xmlDoc || typeof document.evaluate !== "function") return null;
    try {
      const result = xmlDoc.evaluate(
        '//product[@code="' + code + '"]',
        xmlDoc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue ? parseProduct(result.singleNodeValue) : null;
    } catch (e) {
      console.warn("XPath lookup failed, falling back to array search.", e);
      return null;
    }
  }

  function searchProduct(code) {
    const normalized = code.trim().toUpperCase();
    if (!CODE_PATTERN.test(normalized)) {
      showSearchResult("error", "Please enter a valid product code in the format ###-## (e.g. 101-23).");
      return;
    }
    const found = findByCodeXPath(normalized) || products.find((p) => p.code.toUpperCase() === normalized);
    if (!found) {
      showSearchResult("error", "No product found with code " + normalized + ". Please check the code and try again.");
      return;
    }
    showSearchResult("success", renderDetail(found));
  }

  function renderDetail(p) {
    const img = CATEGORY_IMAGE[p.category] || "images/electronics.jpg";
    return `
      <div class="mt-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
        <div class="flex items-start gap-4">
          <img src="${img}" alt="${escapeHtml(p.category)}" class="w-20 h-20 rounded-xl object-cover shadow">
          <div class="flex-1">
            <h3 class="text-lg font-bold text-slate-900">${escapeHtml(p.name)} <span class="text-slate-500 font-normal text-sm">(${escapeHtml(p.code)})</span></h3>
            <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs uppercase tracking-wide text-slate-500">Category</div>
                <div class="font-semibold text-slate-800">${escapeHtml(p.category)}</div>
              </div>
              <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs uppercase tracking-wide text-slate-500">Code</div>
                <div class="font-semibold text-slate-800">${escapeHtml(p.code)}</div>
              </div>
              <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs uppercase tracking-wide text-slate-500">Quantity</div>
                <div class="font-semibold text-slate-800">${p.quantity}</div>
              </div>
              <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs uppercase tracking-wide text-slate-500">Unit Price</div>
                <div class="font-semibold text-slate-800">&euro;${p.unitPrice.toFixed(2)}</div>
              </div>
            </div>
            <p class="mt-3 text-sm text-slate-600"><strong>Description:</strong> ${escapeHtml(p.description)}</p>
            <div class="mt-2">${stockBadge(p)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function showSearchResult(type, htmlOrMsg) {
    els.searchResult.innerHTML = "";
    const div = document.createElement("div");
    if (type === "error") {
      div.className = "px-4 py-3 rounded-lg bg-red-50 text-red-800 border border-red-200";
      div.textContent = htmlOrMsg; // plain text - safe by construction
    } else {
      div.innerHTML = htmlOrMsg;
    }
    els.searchResult.appendChild(div);
  }

  els.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    searchProduct(els.searchCode.value);
  });
  els.clearBtn.addEventListener("click", () => {
    els.searchCode.value = "";
    els.searchResult.innerHTML = "";
  });
  els.categoryFilter.addEventListener("change", renderTable);
  els.nameFilter.addEventListener("input", renderTable);

  // NOTE: the mobile menu toggle is handled once, inline in index.html.
  // (An earlier duplicate listener here cancelled itself out and broke the menu.)

  loadProducts();
})();
