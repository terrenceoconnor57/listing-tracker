(() => {
  'use strict';

  // DOM Elements
  const form = document.getElementById('monitor-form');
  const urlInput = document.getElementById('url');
  const submitBtn = document.getElementById('submit-btn');
  const urlHint = document.getElementById('url-hint');
  const freeUsageEl = document.getElementById('free-usage');
  const loadingEl = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const errorMsg = document.getElementById('error-msg');
  const authBar = document.getElementById('auth-bar');
  const logoutLink = document.getElementById('logout-link');

  // Storage key
  const STORAGE_KEY = 'competitor-tracker-form';

  // State
  let currentUser = null;
  let canAddFree = true;
  let freeUsed = 0;
  const FREE_LIMIT = 2;

  // Validation
  function isValidUrl(str) {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function validateForm() {
    const url = urlInput.value.trim();

    let valid = true;

    // URL validation
    if (!url) {
      urlHint.textContent = '';
      urlHint.className = 'hint';
      valid = false;
    } else if (isValidUrl(url)) {
      urlHint.textContent = '✓ Valid URL';
      urlHint.className = 'hint valid';
    } else {
      urlHint.textContent = 'Enter a valid http/https URL';
      urlHint.className = 'hint error';
      valid = false;
    }

    // Must be logged in
    if (!currentUser) {
      submitBtn.textContent = 'Sign up to start monitoring';
      submitBtn.disabled = !valid;
    } else {
      // Update button text based on free status
      if (canAddFree) {
        submitBtn.textContent = 'Start Monitoring (Free)';
      } else {
        submitBtn.textContent = 'Pay $5 & Start Monitoring';
      }
      submitBtn.disabled = !valid;
    }

    saveToStorage();
    return valid && currentUser;
  }

  // Storage
  function saveToStorage() {
    const data = {
      url: urlInput.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadFromStorage() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data) {
        urlInput.value = data.url || '';
      }
    } catch {
      // Ignore
    }
  }

  // Check auth state
  async function checkAuth() {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      
      if (data.authenticated) {
        currentUser = data.email;
        authBar.classList.add('logged-in');
        checkFreeUsage();
      } else {
        currentUser = null;
        authBar.classList.remove('logged-in');
      }
      
      validateForm();
    } catch {
      currentUser = null;
    }
  }

  // Check free usage
  async function checkFreeUsage() {
    if (!currentUser) {
      freeUsageEl.textContent = 'First 2 URLs free, then $5';
      canAddFree = true;
      return;
    }

    try {
      const res = await fetch('/api/add-monitor');
      const data = await res.json();
      
      freeUsed = data.freeUsed || 0;
      canAddFree = data.canAddFree !== false;
      
      if (freeUsed === 0) {
        freeUsageEl.textContent = 'First 2 URLs free, then $5';
      } else if (freeUsed === 1) {
        freeUsageEl.textContent = '1 of 2 free URLs used';
      } else {
        freeUsageEl.textContent = '2 of 2 free URLs used • $5 for more';
      }
      
      validateForm();
    } catch {
      canAddFree = true;
    }
  }

  function showLoading(text) {
    form.classList.add('hidden');
    loadingEl.classList.remove('hidden');
    loadingText.textContent = text;
    errorMsg.classList.add('hidden');
  }

  function hideLoading() {
    form.classList.remove('hidden');
    loadingEl.classList.add('hidden');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  // Submit handler
  async function handleSubmit(e) {
    e.preventDefault();
    
    const url = urlInput.value.trim();
    
    if (!isValidUrl(url)) return;

    // If not logged in, redirect to signup
    if (!currentUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ url }));
      window.location.href = '/signup.html';
      return;
    }

    if (canAddFree) {
      // Add free monitor
      showLoading('Starting monitor...');

      try {
        const res = await fetch('/api/add-monitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });

        const data = await res.json();

        if (data.requiresPayment) {
          // Need to pay
          canAddFree = false;
          hideLoading();
          validateForm();
          await startPayment(url);
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Failed to create monitor');
        }

        // Success
        window.location.href = '/success.html';

      } catch (err) {
        hideLoading();
        showError(err.message || 'Something went wrong. Please try again.');
      }
    } else {
      // Need to pay
      await startPayment(url, currentUser);
    }
  }

  async function startPayment(url) {
    showLoading('Redirecting to checkout...');

    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      window.location.href = data.checkoutUrl;

    } catch (err) {
      hideLoading();
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  // Event listeners
  urlInput.addEventListener('input', validateForm);
  form.addEventListener('submit', handleSubmit);
  
  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/logout', { method: 'POST' });
      currentUser = null;
      authBar.classList.remove('logged-in');
      validateForm();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  });

  // Init
  loadFromStorage();
  checkAuth();
})();
