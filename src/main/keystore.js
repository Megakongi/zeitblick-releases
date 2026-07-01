/**
 * Schlüsselverwaltung für die optionale Datenverschlüsselung (Hybrid).
 *
 * Modi:
 *  - "local": DEK wird per Electron `safeStorage` (OS-Keychain) gewrappt und in
 *    einer GERÄTELOKALEN Konfig abgelegt (nie synchronisiert). Kein Passwort.
 *  - "sync": DEK wird zusätzlich per Passphrase (scrypt) gewrappt und dieser
 *    Pass-Wrap in den synchronisierten Envelope eingebettet → auf jedem Gerät
 *    mit Passphrase entschlüsselbar. Nach erstem Entsperren wird der DEK lokal
 *    per Keychain gecacht (kein erneutes Passwort pro Gerät).
 *
 * Implementiert das Provider-Interface, das `storage.setKeyProvider()` erwartet:
 *   encryptionActive(), currentDEK(), passWrapForEnvelope(), dekForLoad(env)
 *
 * Die Konfig (enc-config.json) liegt IMMER lokal (userData), getrennt von der
 * (evtl. synchronisierten) Datendatei. Sie enthält keinen Klartext-Schlüssel.
 */

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const cryptoUtil = require('./crypto');

const CONFIG_FILENAME = 'enc-config.json';

let configPath = null;
const state = {
  enabled: false,
  mode: 'local',      // 'local' | 'sync'
  dek: null,          // Buffer, nur im Speicher wenn entsperrt
  passWrap: null,     // scrypt-Wrap (sync-Modus), wird in den Envelope eingebettet
};

function keychainAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function readConfig() {
  try {
    if (configPath && fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8')) || {};
  } catch { /* ignore */ }
  return {};
}

function writeConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

/** DEK gerätelokal via Keychain wrappen (base64) bzw. auspacken. */
function keychainWrap(dek) {
  return safeStorage.encryptString(dek.toString('base64')).toString('base64');
}
function keychainUnwrap(localWrapB64) {
  const b64 = safeStorage.decryptString(Buffer.from(localWrapB64, 'base64'));
  return Buffer.from(b64, 'base64');
}

/** Beim Start: Konfig laden und – falls möglich – DEK aus dem Keychain cachen. */
function init(userDataBase) {
  configPath = path.join(userDataBase, CONFIG_FILENAME);
  const cfg = readConfig();
  state.enabled = !!cfg.enabled;
  state.mode = cfg.mode === 'sync' ? 'sync' : 'local';
  state.passWrap = cfg.passWrap || null;
  state.dek = null;
  if (state.enabled && cfg.localWrap && keychainAvailable()) {
    try { state.dek = keychainUnwrap(cfg.localWrap); } catch { state.dek = null; }
  }
  return status();
}

function persist() {
  const cfg = { enabled: state.enabled, mode: state.mode };
  if (state.enabled && state.dek && keychainAvailable()) cfg.localWrap = keychainWrap(state.dek);
  if (state.mode === 'sync' && state.passWrap) cfg.passWrap = state.passWrap;
  writeConfig(cfg);
}

// ===== Provider-Interface für storage.js =====

function encryptionActive() {
  return !!(state.enabled && state.dek);
}
function currentDEK() {
  if (!state.dek) throw new Error('Datentresor ist gesperrt.');
  return state.dek;
}
function passWrapForEnvelope() {
  return state.mode === 'sync' ? state.passWrap : null;
}
function dekForLoad(envelope) {
  if (state.dek) return state.dek;
  // gerätelokaler Keychain-Cache?
  const cfg = readConfig();
  if (cfg.localWrap && keychainAvailable()) {
    try { state.dek = keychainUnwrap(cfg.localWrap); return state.dek; } catch { /* fällt auf Passphrase */ }
  }
  throw Object.assign(new Error('Passphrase erforderlich.'), { code: 'NEEDS_PASSPHRASE' });
}

// ===== Steuerung (vom Main via IPC) =====

/** Verschlüsselung aktivieren. mode 'local' (Keychain) oder 'sync' (Passphrase). */
function enable({ mode = 'local', passphrase = null } = {}) {
  if (mode === 'local' && !keychainAvailable()) {
    return { success: false, error: 'OS-Keychain nicht verfügbar – nur Passphrase-Modus möglich.' };
  }
  if (mode === 'sync' && !passphrase) {
    return { success: false, error: 'Für den Sync-Modus ist eine Passphrase nötig.' };
  }
  state.dek = cryptoUtil.generateDEK();
  state.enabled = true;
  state.mode = mode;
  state.passWrap = mode === 'sync' ? cryptoUtil.buildPassWrap(state.dek, passphrase) : null;
  persist();
  return { success: true, status: status() };
}

/** Verschlüsselung abschalten (Aufrufer speichert danach im Klartext). */
function disable() {
  state.enabled = false;
  state.dek = null;
  state.passWrap = null;
  state.mode = 'local';
  try { if (configPath && fs.existsSync(configPath)) fs.unlinkSync(configPath); } catch { /* ignore */ }
  return { success: true, status: status() };
}

/** Mit Passphrase entsperren (neues Gerät / kein Keychain-Cache). */
function unlockWithPassphrase(envelope, passphrase) {
  const passWrap = (envelope && envelope.wrap && envelope.wrap.pass) || state.passWrap;
  if (!passWrap) return { success: false, error: 'Keine Passphrase-Hülle vorhanden.' };
  try {
    state.dek = cryptoUtil.openPassWrap(passWrap, passphrase);
    state.enabled = true;
    state.mode = 'sync';
    state.passWrap = passWrap;
    persist(); // cacht DEK lokal via Keychain (falls verfügbar)
    return { success: true, status: status() };
  } catch {
    return { success: false, error: 'Falsche Passphrase.' };
  }
}

/** Passphrase ändern (DEK bleibt gleich, wird nur neu gewrappt). */
function changePassphrase(newPassphrase) {
  if (!state.dek) return { success: false, error: 'Erst entsperren.' };
  if (state.mode !== 'sync') return { success: false, error: 'Passphrase nur im Sync-Modus.' };
  state.passWrap = cryptoUtil.buildPassWrap(state.dek, newPassphrase);
  persist();
  return { success: true };
}

/** DEK aus dem Speicher entfernen (sperren). */
function lock() {
  state.dek = null;
  return { success: true, status: status() };
}

function status() {
  return {
    available: keychainAvailable(),
    enabled: state.enabled,
    unlocked: !!state.dek,
    mode: state.mode,
  };
}

module.exports = {
  init,
  // Provider-Interface
  encryptionActive, currentDEK, passWrapForEnvelope, dekForLoad,
  // Steuerung
  enable, disable, unlockWithPassphrase, changePassphrase, lock, status,
};
