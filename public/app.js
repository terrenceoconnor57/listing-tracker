(() => {
  'use strict';

  // DOM Elements
  const urlInput = document.getElementById('url');
  const emailInput = document.getElementById('email');
  const confirmCheckbox = document.getElementById('confirm');
  const continueBtn = document.getElementById('continue-btn');
  const urlHint = document.getElementById('url-hint');
  const emailHint = document.getElementById('email-hint');

  const stepInfo = document.getElementById('step-info');
  const stepPayment = document.getElementById('step-payment');
  const loadingEl = document.getElementById('loading');
  const errorMsg = document.getElementById('error-msg');

  const summaryUrl = document.getElementById('summary-url');
  const summaryEmail = document.getElementById('summary-email');
  const payBtn = document.getElementById('pay-btn');
  const editBtn = document.getElementById('edit-btn');

  // Storage key
  const STORAGE_KEY = 'job-alert-form';

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
    // Basic email regex
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

    // All conditions
    const allValid = valid && url && email && isValidUrl(url) && isValidEmail(email) && confirmed;
    continueBtn.disabled = !allValid;

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
      // Ignore parse errors
    }
  }

  // UI State
  function showStep(step) {
    if (step === 'info') {
      stepInfo.classList.remove('hidden');
      stepPayment.classList.add('hidden');
      loadingEl.classList.add('hidden');
      errorMsg.classList.add('hidden');
      unlockInputs();
    } else if (step === 'payment') {
      stepInfo.classList.add('hidden');
      stepPayment.classList.remove('hidden');
      loadingEl.classList.add('hidden');
      errorMsg.classList.add('hidden');
      lockInputs();
      updateSummary();
    } else if (step === 'loading') {
      stepInfo.classList.add('hidden');
      stepPayment.classList.add('hidden');
      loadingEl.classList.remove('hidden');
      errorMsg.classList.add('hidden');
    }
  }

  function lockInputs() {
    urlInput.readOnly = true;
    emailInput.readOnly = true;
    confirmCheckbox.disabled = true;
  }

  function unlockInputs() {
    urlInput.readOnly = false;
    emailInput.readOnly = false;
    confirmCheckbox.disabled = false;
  }

  function updateSummary() {
    const url = urlInput.value.trim();
    // Truncate URL if too long
    summaryUrl.textContent = url.length > 50 ? url.substring(0, 50) + '…' : url;
    summaryUrl.title = url;
    summaryEmail.textContent = emailInput.value.trim();
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  // Event Handlers
  urlInput.addEventListener('input', validateForm);
  emailInput.addEventListener('input', validateForm);
  confirmCheckbox.addEventListener('change', validateForm);

  document.getElementById('info-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm()) {
      showStep('payment');
    }
  });

  editBtn.addEventListener('click', () => {
    showStep('info');
    validateForm();
  });

  payBtn.addEventListener('click', async () => {
    showStep('loading');
    
    const url = urlInput.value.trim();
    const email = emailInput.value.trim();

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

      // Redirect to Stripe
      window.location.href = data.checkoutUrl;

    } catch (err) {
      showStep('payment');
      showError(err.message || 'Something went wrong. Please try again.');
    }
  });

  // Init
  loadFromStorage();
  validateForm();
  showStep('info');
})();
