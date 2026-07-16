// =============================================================================
// Inventory Pro — Ledger Control
// Complete client-side engine. Vanilla JS + native Fetch API only.
// Handles: auth state (JWT in localStorage), product CRUD, live currency
// conversion/toggling, client-side validation, and all DOM updates —
// with zero page reloads.
// =============================================================================

(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Constants & state
  // ---------------------------------------------------------------------
  const API_BASE = '/api';
  const TOKEN_KEY = 'inventoryPro.token';
  const USER_KEY = 'inventoryPro.user';

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
    products: [],
    metrics: { totalProducts: 0, totalUnits: 0, totalInventoryValueUSD: 0 },
    rates: { USD: 1, EUR: null, INR: null },
    activeCurrency: 'USD',
    searchTerm: '',
    categoryFilter: '',
    editingProductId: null,
    deletingProductId: null,
  };

  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', INR: '₹' };

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const el = {
    tickerTrack: $('#tickerTrack'),

    sessionGuest: $('#sessionGuest'),
    sessionUser: $('#sessionUser'),
    sessionUsername: $('#sessionUsername'),
    openLoginBtn: $('#openLoginBtn'),
    openRegisterBtn: $('#openRegisterBtn'),
    logoutBtn: $('#logoutBtn'),

    gateNotice: $('#gateNotice'),
    gateLoginBtn: $('#gateLoginBtn'),
    gateRegisterBtn: $('#gateRegisterBtn'),

    dashboard: $('#dashboard'),
    metricTotalProducts: $('#metricTotalProducts'),
    metricTotalUnits: $('#metricTotalUnits'),
    metricTotalValue: $('#metricTotalValue'),
    metricValueHint: $('#metricValueHint'),

    searchInput: $('#searchInput'),
    categoryFilter: $('#categoryFilter'),
    currencyButtons: $$('.currency-toggle__btn'),
    openAddProductBtn: $('#openAddProductBtn'),

    productTableBody: $('#productTableBody'),
    tableEmptyState: $('#tableEmptyState'),
    tableLoadingState: $('#tableLoadingState'),

    toastRegion: $('#toastRegion'),

    loginModal: $('#loginModal'),
    loginForm: $('#loginForm'),
    loginUsername: $('#loginUsername'),
    loginPassword: $('#loginPassword'),
    loginFormError: $('#loginFormError'),
    loginSubmitBtn: $('#loginSubmitBtn'),
    switchToRegister: $('#switchToRegister'),

    registerModal: $('#registerModal'),
    registerForm: $('#registerForm'),
    registerUsername: $('#registerUsername'),
    registerPassword: $('#registerPassword'),
    registerConfirmPassword: $('#registerConfirmPassword'),
    registerFormError: $('#registerFormError'),
    registerSubmitBtn: $('#registerSubmitBtn'),
    switchToLogin: $('#switchToLogin'),

    productModal: $('#productModal'),
    productModalEyebrow: $('#productModalEyebrow'),
    productModalTitle: $('#productModalTitle'),
    productForm: $('#productForm'),
    productId: $('#productId'),
    productName: $('#productName'),
    productPrice: $('#productPrice'),
    productStock: $('#productStock'),
    productCategory: $('#productCategory'),
    productFormError: $('#productFormError'),
    productSubmitBtn: $('#productSubmitBtn'),

    deleteModal: $('#deleteModal'),
    deleteModalBody: $('#deleteModalBody'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),
  };

  // ---------------------------------------------------------------------
  // Utility: toast notifications
  // ---------------------------------------------------------------------
  const showToast = (message, variant = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.textContent = message;
    el.toastRegion.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4200);
  };

  // ---------------------------------------------------------------------
  // Utility: modal open/close
  // ---------------------------------------------------------------------
  const openModal = (modalEl) => {
    modalEl.classList.remove('is-hidden');
  };

  const closeModal = (modalEl) => {
    modalEl.classList.add('is-hidden');
  };

  $$('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close-modal');
      closeModal(document.getElementById(targetId));
    });
  });

  $$('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal(overlay);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $$('.modal-overlay').forEach((overlay) => {
        if (!overlay.classList.contains('is-hidden')) closeModal(overlay);
      });
    }
  });

  // ---------------------------------------------------------------------
  // Core fetch wrapper — attaches JWT automatically, centralizes error
  // handling for the frontend side of things.
  // ---------------------------------------------------------------------
  const apiRequest = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch (networkError) {
      throw new Error('Network error: unable to reach the server. Please check your connection.');
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 401 && state.token) {
        // Token expired/invalid mid-session — force a clean logout.
        handleLogout(false);
        showToast('Your session has expired. Please log in again.', 'error');
      }
      const message = (payload && payload.message) || `Request failed with status ${response.status}.`;
      const error = new Error(message);
      error.details = payload && payload.details;
      throw error;
    }

    return payload;
  };

  // ---------------------------------------------------------------------
  // Auth: session persistence helpers
  // ---------------------------------------------------------------------
  const persistSession = (token, user) => {
    state.token = token;
    state.user = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const clearSession = () => {
    state.token = null;
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const renderAuthState = () => {
    const isAuthed = Boolean(state.token && state.user);

    el.sessionGuest.classList.toggle('is-hidden', isAuthed);
    el.sessionUser.classList.toggle('is-hidden', !isAuthed);
    el.gateNotice.classList.toggle('is-hidden', isAuthed);
    el.dashboard.classList.toggle('is-hidden', !isAuthed);

    if (isAuthed) {
      el.sessionUsername.textContent = state.user.username;
    }
  };

  const handleLogout = (announce = true) => {
    clearSession();
    renderAuthState();
    state.products = [];
    renderTable();
    renderMetrics();
    if (announce) showToast('Logged out successfully.', 'success');
  };

  // ---------------------------------------------------------------------
  // Client-side validation helpers
  // ---------------------------------------------------------------------
  const setFieldError = (inputEl, errorEl, message) => {
    if (message) {
      inputEl.classList.add('is-invalid');
      errorEl.textContent = message;
    } else {
      inputEl.classList.remove('is-invalid');
      errorEl.textContent = '';
    }
  };

  const setFormError = (errorEl, message) => {
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    } else {
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
    }
  };

  const validateUsername = (value) => {
    if (!value) return 'Username is required.';
    if (value.length < 3) return 'Username must be at least 3 characters.';
    if (value.length > 30) return 'Username cannot exceed 30 characters.';
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Only letters, numbers, and underscores are allowed.';
    return '';
  };

  const validatePassword = (value) => {
    if (!value) return 'Password is required.';
    if (value.length < 6) return 'Password must be at least 6 characters.';
    return '';
  };

  // ---------------------------------------------------------------------
  // AUTH: Register
  // ---------------------------------------------------------------------
  el.registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormError(el.registerFormError, '');

    const username = el.registerUsername.value.trim();
    const password = el.registerPassword.value;
    const confirmPassword = el.registerConfirmPassword.value;

    const usernameErr = validateUsername(username);
    const passwordErr = validatePassword(password);
    const confirmErr = password !== confirmPassword ? 'Passwords do not match.' : '';

    setFieldError(el.registerUsername, $('#registerUsernameError'), usernameErr);
    setFieldError(el.registerPassword, $('#registerPasswordError'), passwordErr);
    setFieldError(el.registerConfirmPassword, $('#registerConfirmPasswordError'), confirmErr);

    if (usernameErr || passwordErr || confirmErr) return;

    el.registerSubmitBtn.disabled = true;
    el.registerSubmitBtn.textContent = 'Creating account…';

    try {
      const result = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      persistSession(result.token, result.user);
      renderAuthState();
      closeModal(el.registerModal);
      el.registerForm.reset();
      showToast(`Welcome, ${result.user.username}! Account created.`, 'success');
      await bootstrapDashboard();
    } catch (error) {
      setFormError(el.registerFormError, error.message);
    } finally {
      el.registerSubmitBtn.disabled = false;
      el.registerSubmitBtn.textContent = 'Create account';
    }
  });

  // ---------------------------------------------------------------------
  // AUTH: Login
  // ---------------------------------------------------------------------
  el.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormError(el.loginFormError, '');

    const username = el.loginUsername.value.trim();
    const password = el.loginPassword.value;

    const usernameErr = !username ? 'Username is required.' : '';
    const passwordErr = !password ? 'Password is required.' : '';

    setFieldError(el.loginUsername, $('#loginUsernameError'), usernameErr);
    setFieldError(el.loginPassword, $('#loginPasswordError'), passwordErr);

    if (usernameErr || passwordErr) return;

    el.loginSubmitBtn.disabled = true;
    el.loginSubmitBtn.textContent = 'Logging in…';

    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      persistSession(result.token, result.user);
      renderAuthState();
      closeModal(el.loginModal);
      el.loginForm.reset();
      showToast(`Welcome back, ${result.user.username}.`, 'success');
      await bootstrapDashboard();
    } catch (error) {
      setFormError(el.loginFormError, error.message);
    } finally {
      el.loginSubmitBtn.disabled = false;
      el.loginSubmitBtn.textContent = 'Log in';
    }
  });

  // ---------------------------------------------------------------------
  // AUTH: modal open/switch/logout wiring
  // ---------------------------------------------------------------------
  [el.openLoginBtn, el.gateLoginBtn].forEach((btn) => btn.addEventListener('click', () => openModal(el.loginModal)));
  [el.openRegisterBtn, el.gateRegisterBtn].forEach((btn) => btn.addEventListener('click', () => openModal(el.registerModal)));

  el.switchToRegister.addEventListener('click', () => {
    closeModal(el.loginModal);
    openModal(el.registerModal);
  });

  el.switchToLogin.addEventListener('click', () => {
    closeModal(el.registerModal);
    openModal(el.loginModal);
  });

  el.logoutBtn.addEventListener('click', () => handleLogout(true));

  // ---------------------------------------------------------------------
  // CURRENCY: fetch live rates + ticker rendering
  // ---------------------------------------------------------------------
  const fetchRates = async () => {
    try {
      const result = await apiRequest('/currency/rates');
      state.rates = result.rates;
      renderTicker(result);
      renderMetrics();
      renderTable();
    } catch (error) {
      renderTickerError();
    }
  };

  const renderTicker = (result) => {
    const { rates, cached, stale } = result;
    const parts = [];

    parts.push(
      `<span class="ticker__item"><strong>USD</strong> base &middot; live rates via open.er-api.com</span>`
    );
    parts.push(`<span class="ticker__divider">◆</span>`);
    parts.push(`<span class="ticker__item">1 USD = <strong>${rates.EUR.toFixed(4)}</strong> EUR</span>`);
    parts.push(`<span class="ticker__divider">◆</span>`);
    parts.push(`<span class="ticker__item">1 USD = <strong>${rates.INR.toFixed(4)}</strong> INR</span>`);
    parts.push(`<span class="ticker__divider">◆</span>`);
    parts.push(
      `<span class="ticker__item">${stale ? 'STALE CACHE (upstream unreachable)' : cached ? 'CACHED' : 'FRESH FETCH'}</span>`
    );

    // Duplicate content so the scrolling loop reads seamlessly
    el.tickerTrack.innerHTML = parts.join('') + parts.join('');
  };

  const renderTickerError = () => {
    el.tickerTrack.innerHTML =
      '<span class="ticker__item">LIVE RATE FEED UNAVAILABLE — showing last known values where possible</span>';
  };

  const convert = (usdValue) => {
    const rate = state.rates[state.activeCurrency] || 1;
    return usdValue * rate;
  };

  const formatCurrency = (usdValue) => {
    const symbol = CURRENCY_SYMBOLS[state.activeCurrency];
    const converted = convert(usdValue);
    return `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  el.currencyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCurrency = btn.getAttribute('data-currency');
      el.currencyButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      renderMetrics();
      renderTable();
    });
  });

  // ---------------------------------------------------------------------
  // PRODUCTS: load, render metrics, render table
  // ---------------------------------------------------------------------
  const loadProducts = async () => {
    el.tableLoadingState.classList.remove('is-hidden');
    el.tableEmptyState.classList.add('is-hidden');

    try {
      const query = new URLSearchParams();
      if (state.searchTerm) query.set('search', state.searchTerm);
      if (state.categoryFilter) query.set('category', state.categoryFilter);

      const result = await apiRequest(`/products?${query.toString()}`);
      state.products = result.data;
      state.metrics = result.metrics;
      renderMetrics();
      renderTable();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      el.tableLoadingState.classList.add('is-hidden');
    }
  };

  const renderMetrics = () => {
    el.metricTotalProducts.textContent = state.metrics.totalProducts.toLocaleString();
    el.metricTotalUnits.textContent = state.metrics.totalUnits.toLocaleString();
    el.metricTotalValue.textContent = formatCurrency(state.metrics.totalInventoryValueUSD);
    el.metricValueHint.textContent = `converted to ${state.activeCurrency} at live rate`;
  };

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const renderTable = () => {
    if (!state.products.length) {
      el.productTableBody.innerHTML = '';
      el.tableEmptyState.classList.remove('is-hidden');
      return;
    }

    el.tableEmptyState.classList.add('is-hidden');

    el.productTableBody.innerHTML = state.products
      .map((product) => {
        const lineValueUSD = product.price * product.stock_quantity;
        return `
          <tr data-id="${product._id}">
            <td class="cell-product">${escapeHtml(product.product_name)}</td>
            <td><span class="cell-category">${escapeHtml(product.category)}</span></td>
            <td class="cell-mono">${formatCurrency(product.price)}</td>
            <td class="cell-mono">${product.stock_quantity.toLocaleString()}</td>
            <td class="cell-mono">${formatCurrency(lineValueUSD)}</td>
            <td>
              <div class="cell-actions">
                <button class="icon-btn" data-action="edit" data-id="${product._id}" title="Edit product" aria-label="Edit ${escapeHtml(product.product_name)}">✎</button>
                <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${product._id}" title="Delete product" aria-label="Delete ${escapeHtml(product.product_name)}">🗑</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  el.productTableBody.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    const product = state.products.find((p) => p._id === id);
    if (!product) return;

    if (action === 'edit') openProductModal(product);
    if (action === 'delete') openDeleteModal(product);
  });

  // ---------------------------------------------------------------------
  // Search / filter wiring (debounced search)
  // ---------------------------------------------------------------------
  let searchDebounceTimer;
  el.searchInput.addEventListener('input', (event) => {
    state.searchTerm = event.target.value.trim();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(loadProducts, 350);
  });

  el.categoryFilter.addEventListener('change', (event) => {
    state.categoryFilter = event.target.value;
    loadProducts();
  });

  // ---------------------------------------------------------------------
  // PRODUCT MODAL: add / edit
  // ---------------------------------------------------------------------
  const openProductModal = (product = null) => {
    el.productForm.reset();
    ['productName', 'productPrice', 'productStock', 'productCategory'].forEach((key) => {
      setFieldError(el[key], $(`#${key}Error`), '');
    });
    setFormError(el.productFormError, '');

    if (product) {
      state.editingProductId = product._id;
      el.productModalEyebrow.textContent = 'Edit ledger entry';
      el.productModalTitle.textContent = 'Edit product';
      el.productSubmitBtn.textContent = 'Save changes';
      el.productId.value = product._id;
      el.productName.value = product.product_name;
      el.productPrice.value = product.price;
      el.productStock.value = product.stock_quantity;
      el.productCategory.value = product.category;
    } else {
      state.editingProductId = null;
      el.productModalEyebrow.textContent = 'New ledger entry';
      el.productModalTitle.textContent = 'Add product';
      el.productSubmitBtn.textContent = 'Save product';
      el.productId.value = '';
    }

    openModal(el.productModal);
  };

  el.openAddProductBtn.addEventListener('click', () => openProductModal());

  el.productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormError(el.productFormError, '');

    const name = el.productName.value.trim();
    const price = parseFloat(el.productPrice.value);
    const stock = parseInt(el.productStock.value, 10);
    const category = el.productCategory.value;

    const nameErr = name.length < 2 ? 'Product name must be at least 2 characters.' : name.length > 120 ? 'Product name is too long.' : '';
    const priceErr = Number.isNaN(price) || price < 0 ? 'Enter a valid non-negative price.' : '';
    const stockErr = Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock) ? 'Enter a valid non-negative whole number.' : '';
    const categoryErr = !category ? 'Please select a category.' : '';

    setFieldError(el.productName, $('#productNameError'), nameErr);
    setFieldError(el.productPrice, $('#productPriceError'), priceErr);
    setFieldError(el.productStock, $('#productStockError'), stockErr);
    setFieldError(el.productCategory, $('#productCategoryError'), categoryErr);

    if (nameErr || priceErr || stockErr || categoryErr) return;

    const payload = { product_name: name, price, stock_quantity: stock, category };

    el.productSubmitBtn.disabled = true;
    el.productSubmitBtn.textContent = 'Saving…';

    try {
      if (state.editingProductId) {
        await apiRequest(`/products/${state.editingProductId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Product updated successfully.', 'success');
      } else {
        await apiRequest('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Product added to the ledger.', 'success');
      }

      closeModal(el.productModal);
      await loadProducts();
    } catch (error) {
      const detailMsg = error.details && error.details.length ? ` ${error.details.join(' ')}` : '';
      setFormError(el.productFormError, error.message + detailMsg);
    } finally {
      el.productSubmitBtn.disabled = false;
      el.productSubmitBtn.textContent = state.editingProductId ? 'Save changes' : 'Save product';
    }
  });

  // ---------------------------------------------------------------------
  // DELETE MODAL
  // ---------------------------------------------------------------------
  const openDeleteModal = (product) => {
    state.deletingProductId = product._id;
    el.deleteModalBody.textContent = `"${product.product_name}" will be permanently removed from the ledger. This action cannot be undone.`;
    openModal(el.deleteModal);
  };

  el.confirmDeleteBtn.addEventListener('click', async () => {
    if (!state.deletingProductId) return;

    el.confirmDeleteBtn.disabled = true;
    el.confirmDeleteBtn.textContent = 'Deleting…';

    try {
      await apiRequest(`/products/${state.deletingProductId}`, { method: 'DELETE' });
      showToast('Product removed from the ledger.', 'success');
      closeModal(el.deleteModal);
      await loadProducts();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      state.deletingProductId = null;
      el.confirmDeleteBtn.disabled = false;
      el.confirmDeleteBtn.textContent = 'Delete product';
    }
  });

  // ---------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------
  const bootstrapDashboard = async () => {
    if (!state.token) return;
    await Promise.all([loadProducts(), fetchRates()]);
  };

  const init = async () => {
    renderAuthState();
    await fetchRates(); // ticker runs regardless of auth state
    if (state.token && state.user) {
      await bootstrapDashboard();
    }

    // Refresh rates periodically so the ticker + values stay live
    setInterval(fetchRates, 5 * 60 * 1000);
  };

  init();
})();
