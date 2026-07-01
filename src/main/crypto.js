/**
 * Krypto-Bausteine für die optionale Verschlüsselung der lokalen Datendatei.
 *
 * Reine Node-`crypto`-Funktionen (keine Electron-Abhängigkeit), damit sie
 * unabhängig testbar sind. Die gerätegebundene Schlüsselablage (Keychain via
 * Electron `safeStorage`) liegt bewusst NICHT hier, sondern im Main-Prozess.
 *
 * Design – DEK-Indirektion:
 *   - Ein zufälliger Data Encryption Key (DEK, 32 Byte) verschlüsselt die Daten.
 *   - Der DEK wird "gewrappt" (selbst verschlüsselt) abgelegt – entweder per
 *     Keychain (lokal, im Main) oder per Passphrase-abgeleitetem KEK (sync).
 *   - Schlüsselwechsel = nur DEK neu wrappen, nie die ganze Datei neu chiffrieren.
 *
 * Alle Verfahren: AES-256-GCM (authentifiziert), Schlüsselableitung scrypt.
 */

const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

// scrypt-Parameter (bewusst kräftig; maxmem entsprechend hochgesetzt)
const KDF = { N: 32768, r: 8, p: 1 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/** Kryptographisch zufällige Bytes als Buffer. */
function randomBytes(n) {
  return crypto.randomBytes(n);
}

/** Neuer 32-Byte Data Encryption Key. */
function generateDEK() {
  return crypto.randomBytes(KEY_BYTES);
}

/**
 * AES-256-GCM-Verschlüsselung.
 * @param {Buffer|string} data  Klartext (utf8-String oder Buffer)
 * @param {Buffer} key  32-Byte-Schlüssel
 * @returns {{iv:string, tag:string, ct:string}} base64-kodiert
 */
function aesEncrypt(data, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') };
}

/**
 * AES-256-GCM-Entschlüsselung. Wirft bei falschem Schlüssel oder manipuliertem
 * Chiffrat (GCM-Auth schlägt fehl).
 * @returns {Buffer} Klartext
 */
function aesDecrypt({ iv, tag, ct }, key) {
  const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]);
}

/** Neues Salt (base64) für die Passphrase-Ableitung. */
function newSalt() {
  return crypto.randomBytes(SALT_BYTES).toString('base64');
}

/**
 * Leitet aus Passphrase + Salt einen 32-Byte Key Encryption Key (KEK) ab.
 * @param {string} passphrase
 * @param {string} saltB64
 * @param {{N:number,r:number,p:number}} [params]
 */
function deriveKEK(passphrase, saltB64, params = KDF) {
  const salt = Buffer.from(saltB64, 'base64');
  return crypto.scryptSync(Buffer.from(String(passphrase), 'utf8'), salt, KEY_BYTES, {
    N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM,
  });
}

/** DEK mit einem KEK (oder beliebigem 32-Byte-Key) wrappen. */
function wrapDEK(dek, kek) {
  return aesEncrypt(dek, kek);
}

/** Gewrappten DEK mit dem KEK auspacken. @returns {Buffer} DEK */
function unwrapDEK(wrapped, kek) {
  return aesDecrypt(wrapped, kek);
}

/**
 * Baut die Passphrase-Wrap-Struktur (für den synchronisierten Envelope):
 * leitet KEK aus Passphrase ab und wrappt den DEK.
 * @returns {{kdf:string, N:number, r:number, p:number, salt:string, wrappedDEK:object}}
 */
function buildPassWrap(dek, passphrase) {
  const salt = newSalt();
  const kek = deriveKEK(passphrase, salt);
  return { kdf: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p, salt, wrappedDEK: wrapDEK(dek, kek) };
}

/**
 * Öffnet die Passphrase-Wrap-Struktur mit der Passphrase.
 * @returns {Buffer} DEK  (wirft bei falscher Passphrase)
 */
function openPassWrap(passWrap, passphrase) {
  const kek = deriveKEK(passphrase, passWrap.salt, { N: passWrap.N, r: passWrap.r, p: passWrap.p });
  return unwrapDEK(passWrap.wrappedDEK, kek);
}

/** Ist das geladene Objekt ein verschlüsselter Envelope? */
function isEncrypted(obj) {
  return !!(obj && obj._enc === 1 && obj.ct && obj.iv && obj.tag);
}

/**
 * Baut einen verschlüsselten Envelope. Header (_version, _lastWrite) bleibt im
 * Klartext, damit Konflikterkennung ohne Entschlüsselung funktioniert.
 *
 * @param {string} plaintextJson  vollständiger Daten-JSON-String
 * @param {Buffer} dek
 * @param {{version?:number, lastWrite?:object, passWrap?:object}} meta
 */
function encryptEnvelope(plaintextJson, dek, meta = {}) {
  const { iv, tag, ct } = aesEncrypt(plaintextJson, dek);
  const env = { _enc: 1, alg: ALG, iv, tag, ct };
  if (meta.version != null) env._version = meta.version;
  if (meta.lastWrite != null) env._lastWrite = meta.lastWrite;
  if (meta.passWrap) env.wrap = { pass: meta.passWrap };
  return env;
}

/**
 * Entschlüsselt einen Envelope mit dem DEK. @returns {string} Klartext-JSON.
 */
function decryptEnvelope(env, dek) {
  return aesDecrypt({ iv: env.iv, tag: env.tag, ct: env.ct }, dek).toString('utf8');
}

module.exports = {
  ALG, KDF,
  randomBytes,
  generateDEK,
  aesEncrypt,
  aesDecrypt,
  newSalt,
  deriveKEK,
  wrapDEK,
  unwrapDEK,
  buildPassWrap,
  openPassWrap,
  isEncrypted,
  encryptEnvelope,
  decryptEnvelope,
};
