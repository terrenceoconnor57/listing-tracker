(() => {
  'use strict';

  // DOM Elements
  const form = document.getElementById('monitor-form');
  const urlInput = document.getElementById('url');
  const emailInput = document.getElementById('email');
  const confirmCheckbox = document.getElementById('confirm');
  const submitBtn = document.getElementById('submit-btn');
  const urlHint = document.getElementById('url-hint');
  const emailHint = document.getElementById('email-hint');
  const freeUsageEl = document.getElementById('free-usage');
  const loadingEl = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const errorMsg = document.getElementById('error-msg');

  // Storage key
  const STORAGE_KEY = 'job-alert-form';

  // State
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

  function isValidEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  function validateForm() {
    const url = urlInput.value.trim();
    const email = emailInput.value.trim();
    const confirmed = confirmCheckbox.checked;

    let valid = true;

    // URL validation
    if (!url) {
      urlHint.textContent = '';
      urlHint.className = 'hint';
    } else if (isValidUrl(url)) {
      urlHint.textContent = '✓ Valid URL';
      urlHint.className = 'hint valid';
    } else {
      urlHint.textContent = 'Enter a valid http/https URL';
      urlHint.className = 'hint error';
      valid = false;
    }

    // Email validation
    if (!email) {
      emailHint.textContent = '';
      emailHint.className = 'hint';
    } else if (isValidEmail(email)) {
      emailHint.textContent = '✓ Valid email';
      emailHint.className = 'hint valid';
    } else {
      emailHint.textContent = 'Enter a valid email address';
      emailHint.className = 'hint error';
      valid = false;
    }

    const allValid = valid && url && email && isValidUrl(url) && isValidEmail(email) && confirmed;
    
    // Update button text based on free status
    if (canAddFree) {
      submitBtn.textContent = 'Start Monitoring (Free)';
    } else {
      submitBtn.textContent = 'Pay $5 & Start Monitoring';
    }
    
    submitBtn.disabled = !allValid;

    saveToStorage();
    return allValid;
  }

  // Storage
  function saveToStorage() {
    const data = {
      url: urlInput.value,
      email: emailInput.value,
      confirmed: confirmCheckbox.checked
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadFromStorage() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data) {
        urlInput.value = data.url || '';
        emailInput.value = data.email || '';
        confirmCheckbox.checked = data.confirmed || false;
      }
    } catch {
      // Ignore
    }
  }

  // Check free usage
  async function checkFreeUsage() {
    const email = emailInput.value.trim();
    if (!isValidEmail(email)) {
      freeUsageEl.textContent = 'First 2 URLs free, then $5';
      canAddFree = true;
      return;
    }

    try {
      const res = await fetch(`/api/add-monitor?email=${encodeURIComponent(email)}`);
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
    if (!validateForm()) return;

    const url = urlInput.value.trim();
    const email = emailInput.value.trim();

    if (canAddFree) {
      // Add free monitor
      showLoading('Starting monitor...');

      try {
        const res = await fetch('/api/add-monitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, email })
        });

        const data = await res.json();

        if (data.requiresPayment) {
          // Need to pay
          canAddFree = false;
          hideLoading();
          validateForm();
          await startPayment(url, email);
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
      await startPayment(url, email);
    }
  }

  async function startPayment(url, email) {
    showLoading('Redirecting to checkout...');

    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email })
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
  emailInput.addEventListener('input', () => {
    validateForm();
    clearTimeout(emailInput._timeout);
    emailInput._timeout = setTimeout(checkFreeUsage, 500);
  });
  confirmCheckbox.addEventListener('change', validateForm);
  form.addEventListener('submit', handleSubmit);

  // Init
  loadFromStorage();
  validateForm();
  checkFreeUsage();
})();
