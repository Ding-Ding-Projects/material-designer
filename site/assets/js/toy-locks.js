/**
 * Site-local toy locks.
 *
 * This is deliberately a playful browser-local speed bump, not encryption or
 * an access-control boundary. The protected action can run only through
 * interceptProtectedActivation(), which opens the anchored prompt while the
 * target is locked and invokes the action only after every configured factor
 * has matched.
 */

export const STORAGE_KEY = 'md-designer.site.toy-lock.v1';
export const MAX_ATTEMPTS = 5;
export const RETRY_DELAY_MS = 60_000;

export const POLICIES = Object.freeze([
  Object.freeze({ id: 'pin', label: 'PIN', factors: Object.freeze(['pin']) }),
  Object.freeze({ id: 'password', label: 'Password', factors: Object.freeze(['password']) }),
  Object.freeze({ id: 'pin-password', label: 'PIN plus password', factors: Object.freeze(['pin', 'password']) }),
  Object.freeze({ id: 'password-totp', label: 'Password plus TOTP', factors: Object.freeze(['password', 'totp']) }),
  Object.freeze({ id: 'pin-totp', label: 'PIN plus TOTP', factors: Object.freeze(['pin', 'totp']) }),
  Object.freeze({ id: 'password-pin-totp', label: 'Password plus PIN plus TOTP', factors: Object.freeze(['password', 'pin', 'totp']) }),
]);

const POLICY_IDS = new Set(POLICIES.map((policy) => policy.id));
const memoryStore = new Map();
const KEY_DATABASE = 'md-designer-site-private-keys';
const KEY_STORE = 'toy-lock-keys';
const TOTP_KEY_ID = 'protected-example-totp';

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('[toy-lock] Browser storage is unavailable; using session memory.', error);
  }
  return memoryStore.get(STORAGE_KEY) || null;
}

function writeStorage(value) {
  memoryStore.set(STORAGE_KEY, value);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn('[toy-lock] Browser storage is unavailable; using session memory.', error);
  }
}

function normalisePin(value) {
  return String(value || '').replace(/[\s-]/g, '');
}

function validPin(value) {
  const pin = normalisePin(value);
  return /^\d{4,12}$/.test(pin) ? pin : null;
}

function normaliseBase32(value) {
  return String(value || '').toUpperCase().replace(/[\s=-]/g, '');
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const source = normaliseBase32(value);
  if (!source || [...source].some((character) => !alphabet.includes(character))) return null;
  let bits = '';
  for (const character of source) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return new Uint8Array(bytes);
}

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('This browser does not provide private key storage.'));
      return;
    }
    const request = indexedDB.open(KEY_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE);
    request.onerror = () => reject(new Error('The browser refused private key storage.'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function useKeyStore(mode, operation) {
  const database = await openKeyDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, mode);
      const request = operation(transaction.objectStore(KEY_STORE));
      request.onerror = () => reject(new Error('The browser refused the private key operation.'));
      request.onsuccess = () => resolve(request.result);
      transaction.onabort = () => reject(new Error('The private key operation was cancelled.'));
    });
  } finally {
    database.close();
  }
}

async function storeTotpKey(secret) {
  const bytes = decodeBase32(secret);
  if (!bytes) throw new Error('Enter a valid base32 TOTP secret.');
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  await useKeyStore('readwrite', (store) => store.put(key, TOTP_KEY_ID));
}

async function readTotpKey() {
  const key = await useKeyStore('readonly', (store) => store.get(TOTP_KEY_ID));
  if (!key || key.extractable || key.type !== 'secret') throw new Error('The saved TOTP key is unavailable.');
  return key;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(String(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function currentTotp(key, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const message = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary = ((signature[offset] & 0x7f) << 24)
    | ((signature[offset + 1] & 0xff) << 16)
    | ((signature[offset + 2] & 0xff) << 8)
    | (signature[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function policyFor(id) {
  return POLICIES.find((policy) => policy.id === id) || POLICIES[0];
}

function safeState(candidate) {
  if (!candidate || candidate.version !== 1 || !POLICY_IDS.has(candidate.policy)) return null;
  return {
    version: 1,
    policy: candidate.policy,
    pinHash: typeof candidate.pinHash === 'string' ? candidate.pinHash : null,
    passwordHash: typeof candidate.passwordHash === 'string' ? candidate.passwordHash : null,
    hasTotpKey: candidate.hasTotpKey === true,
    remaining: Number.isInteger(candidate.remaining) ? Math.max(0, Math.min(MAX_ATTEMPTS, candidate.remaining)) : MAX_ATTEMPTS,
    retryAt: Number.isFinite(candidate.retryAt) ? Math.max(0, candidate.retryAt) : 0,
  };
}

function setVisibility(root, factors) {
  for (const row of root.querySelectorAll('[data-toy-factor]')) {
    row.hidden = !factors.includes(row.getAttribute('data-toy-factor'));
  }
}

function positionPopover(popover, anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  popover.hidden = false;
  const popRect = popover.getBoundingClientRect();
  const margin = 12;
  const left = Math.min(window.scrollX + window.innerWidth - popRect.width - margin,
    Math.max(window.scrollX + margin, window.scrollX + anchorRect.left));
  const below = window.scrollY + anchorRect.bottom + 8;
  const above = window.scrollY + anchorRect.top - popRect.height - 8;
  const top = below + popRect.height <= window.scrollY + window.innerHeight - margin ? below : Math.max(window.scrollY + margin, above);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function buildPrompt() {
  const popover = document.createElement('section');
  popover.className = 'md-popover toy-lock-prompt';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'false');
  popover.setAttribute('aria-labelledby', 'toy-lock-prompt-title');
  popover.setAttribute('aria-describedby', 'toy-lock-prompt-disclosure');
  popover.innerHTML = `
    <div class="md-popover__header">
      <h3 class="md-popover__title" id="toy-lock-prompt-title">Unlock the protected example</h3>
      <button type="button" class="md-icon-btn md-icon-btn--small" data-toy-close aria-label="Close authentication prompt">×</button>
    </div>
    <p class="md-body-small on-surface-variant" data-toy-policy></p>
    <p class="md-body-small toy-lock-disclosure" id="toy-lock-prompt-disclosure">For fun only. This is not security or encryption. Clear this site's browser storage to recover.</p>
    <form data-toy-auth-form novalidate>
      <label class="toy-lock-field" data-toy-factor="pin">PIN
        <input class="md-input" data-toy-auth-pin inputmode="numeric" autocomplete="off" pattern="[0-9 -]{4,14}">
      </label>
      <div class="toy-lock-keypad" data-toy-factor="pin" aria-label="Access-control keypad">
        ${[1,2,3,4,5,6,7,8,9].map((digit) => `<button type="button" data-toy-digit="${digit}">${digit}</button>`).join('')}
        <button type="button" data-toy-clear aria-label="Clear PIN">Clear</button>
        <button type="button" data-toy-digit="0">0</button>
        <button type="button" data-toy-backspace aria-label="Delete last PIN digit">⌫</button>
      </div>
      <label class="toy-lock-field" data-toy-factor="password">Password
        <input class="md-input" data-toy-auth-password type="password" autocomplete="current-password">
      </label>
      <label class="toy-lock-field" data-toy-factor="totp">TOTP code
        <input class="md-input" data-toy-auth-totp inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6">
      </label>
      <p class="md-body-small" data-toy-auth-status role="status" aria-live="polite"></p>
      <div class="md-dialog__actions">
        <button type="button" class="md-btn md-btn--text" data-toy-close>Cancel</button>
        <button type="submit" class="md-btn md-btn--filled" data-toy-submit>Authenticate</button>
      </div>
    </form>`;
  document.body.append(popover);
  return popover;
}

export function initToyLocks({ notify } = {}) {
  const setup = document.querySelector('[data-toy-lock-setup]');
  const target = document.querySelector('[data-toy-lock-target]');
  if (!setup || !target) return null;

  const policySelect = setup.querySelector('[data-toy-policy-select]');
  const saveButton = setup.querySelector('[data-toy-save]');
  const setupStatus = setup.querySelector('[data-toy-setup-status]');
  const actionStatus = document.querySelector('[data-toy-action-status]');
  const protectedContent = document.querySelector('[data-toy-protected-content]');
  const prompt = buildPrompt();
  const storedState = readStorage();
  let state = safeState(storedState);
  if (state && storedState && Object.prototype.hasOwnProperty.call(storedState, 'totpSecret')) writeStorage(state);
  let action = null;
  let anchor = null;

  for (const policy of POLICIES) {
    const option = document.createElement('option');
    option.value = policy.id;
    option.textContent = policy.label;
    policySelect.append(option);
  }

  function refreshSetup() {
    const policy = policyFor(policySelect.value);
    setVisibility(setup, policy.factors);
  }

  async function saveConfiguration() {
    const policy = policyFor(policySelect.value);
    const pin = validPin(setup.querySelector('[data-toy-setup-pin]').value);
    const password = setup.querySelector('[data-toy-setup-password]').value;
    const totpSecret = normaliseBase32(setup.querySelector('[data-toy-setup-totp]').value);
    if (policy.factors.includes('pin') && !pin) {
      setupStatus.textContent = 'PIN must contain 4 to 12 digits. Keypad and manual entry use this same rule.';
      return;
    }
    if (policy.factors.includes('password') && !password) {
      setupStatus.textContent = 'Enter a password for this local toy lock.';
      return;
    }
    if (policy.factors.includes('totp') && !decodeBase32(totpSecret)) {
      setupStatus.textContent = 'Enter a valid base32 TOTP secret from your authenticator.';
      return;
    }
    if (policy.factors.includes('totp')) {
      try {
        await storeTotpKey(totpSecret);
      } catch (error) {
        setupStatus.textContent = `${error.message} TOTP policies remain visible but cannot be saved in this browser.`;
        return;
      }
    }
    state = {
      version: 1,
      policy: policy.id,
      pinHash: policy.factors.includes('pin') ? await digest(pin) : null,
      passwordHash: policy.factors.includes('password') ? await digest(password) : null,
      hasTotpKey: policy.factors.includes('totp'),
      remaining: MAX_ATTEMPTS,
      retryAt: 0,
    };
    writeStorage(state);
    setup.querySelector('[data-toy-setup-pin]').value = '';
    setup.querySelector('[data-toy-setup-password]').value = '';
    setup.querySelector('[data-toy-setup-totp]').value = '';
    target.setAttribute('aria-disabled', 'true');
    target.setAttribute('data-toy-locked', 'true');
    setupStatus.textContent = `Locked with ${policy.label}. The protected action is intercepted until every factor matches.`;
    if (notify) notify({ title: 'Toy lock saved locally', tone: 'success' });
  }

  function closePrompt() {
    prompt.hidden = true;
    action = null;
    if (anchor) anchor.focus();
    anchor = null;
  }

  async function gradeAuthentication(form) {
    if (!state) return false;
    const now = Date.now();
    if (state.retryAt > now) return false;
    if (state.retryAt && state.retryAt <= now) {
      state.remaining = MAX_ATTEMPTS;
      state.retryAt = 0;
    }
    const policy = policyFor(state.policy);
    const submittedPin = validPin(form.querySelector('[data-toy-auth-pin]').value);
    const submittedPassword = form.querySelector('[data-toy-auth-password]').value;
    const submittedTotp = form.querySelector('[data-toy-auth-totp]').value.replace(/\s/g, '');
    const checks = [];
    if (policy.factors.includes('pin')) checks.push(Boolean(submittedPin) && await digest(submittedPin) === state.pinHash);
    if (policy.factors.includes('password')) checks.push(await digest(submittedPassword) === state.passwordHash);
    if (policy.factors.includes('totp')) {
      let totpKey;
      try {
        totpKey = await readTotpKey();
      } catch (error) {
        form.querySelector('[data-toy-auth-status]').textContent = `${error.message} Clear this site's browser storage and create the toy lock again.`;
        return null;
      }
      const candidates = await Promise.all([-30_000, 0, 30_000].map((offset) => currentTotp(totpKey, now + offset)));
      checks.push(candidates.includes(submittedTotp));
    }
    if (checks.length === policy.factors.length && checks.every(Boolean)) {
      state.remaining = MAX_ATTEMPTS;
      state.retryAt = 0;
      writeStorage(state);
      return true;
    }
    state.remaining = Math.max(0, state.remaining - 1);
    if (state.remaining === 0) state.retryAt = now + RETRY_DELAY_MS;
    writeStorage(state);
    return false;
  }

  function openPrompt(protectedAction, origin) {
    if (!state) {
      setupStatus.textContent = 'Create the local toy lock before trying the protected example.';
      setup.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    action = protectedAction;
    anchor = origin;
    const policy = policyFor(state.policy);
    prompt.querySelector('[data-toy-policy]').textContent = `Required policy: ${policy.label}`;
    setVisibility(prompt, policy.factors);
    const form = prompt.querySelector('[data-toy-auth-form]');
    form.reset();
    prompt.querySelector('[data-toy-auth-status]').textContent = '';
    positionPopover(prompt, origin);
    const first = prompt.querySelector('[data-toy-factor]:not([hidden]) input');
    if (first) first.focus();
  }

  function interceptProtectedActivation(event, protectedAction) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!state) {
      openPrompt(protectedAction, target);
      return;
    }
    if (target.getAttribute('data-toy-locked') !== 'true') {
      protectedAction();
      return;
    }
    openPrompt(protectedAction, target);
  }

  policySelect.addEventListener('change', refreshSetup);
  saveButton.addEventListener('click', saveConfiguration);
  target.addEventListener('click', (event) => interceptProtectedActivation(event, () => {
    if (protectedContent) protectedContent.hidden = false;
    actionStatus.textContent = 'Protected action completed after authentication.';
    if (notify) notify({ title: 'Protected example opened', tone: 'success' });
  }));

  prompt.addEventListener('click', (event) => {
    const digit = event.target.closest('[data-toy-digit]');
    const pin = prompt.querySelector('[data-toy-auth-pin]');
    if (digit) pin.value = normalisePin(pin.value + digit.getAttribute('data-toy-digit')).slice(0, 12);
    if (event.target.closest('[data-toy-clear]')) pin.value = '';
    if (event.target.closest('[data-toy-backspace]')) pin.value = normalisePin(pin.value).slice(0, -1);
    if (event.target.closest('[data-toy-close]')) closePrompt();
  });

  prompt.querySelector('[data-toy-auth-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = prompt.querySelector('[data-toy-submit]');
    const status = prompt.querySelector('[data-toy-auth-status]');
    const now = Date.now();
    if (state && state.retryAt > now) {
      const seconds = Math.ceil((state.retryAt - now) / 1000);
      status.textContent = `Attempt budget exhausted. Try again in ${seconds} seconds, or clear this site's browser storage to recover.`;
      return;
    }
    submit.disabled = true;
    try {
      const verdict = await gradeAuthentication(event.currentTarget);
      if (verdict === true) {
        const completed = action;
        closePrompt();
        if (completed) completed();
      } else if (verdict === false) {
        const remaining = state ? state.remaining : 0;
        status.textContent = remaining > 0
          ? `The factors did not match. ${remaining} attempts remain.`
          : 'Attempt budget exhausted for 60 seconds. Clear this site\'s browser storage to recover.';
      }
    } finally {
      submit.disabled = false;
    }
  });

  prompt.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePrompt();
  });
  window.addEventListener('resize', () => { if (!prompt.hidden && anchor) positionPopover(prompt, anchor); });
  window.addEventListener('scroll', () => { if (!prompt.hidden && anchor) positionPopover(prompt, anchor); }, true);

  policySelect.value = state ? state.policy : POLICIES[0].id;
  refreshSetup();
  if (state) {
    target.setAttribute('aria-disabled', 'true');
    target.setAttribute('data-toy-locked', 'true');
    setupStatus.textContent = `Browser-local lock restored with ${policyFor(state.policy).label}.`;
  }

  return { interceptProtectedActivation, policyCount: POLICIES.length };
}
