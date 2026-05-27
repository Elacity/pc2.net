/**
 * pc2-secure-view-session.js — Token-only IndexedDB helpers.
 *
 * With backend-owned P-256 sessions, the browser never holds any session
 * key material. It only persists the opaque bearer token issued by
 * `/api/storage/lit/complete-session`, along with the `sessionId` and
 * `expiresAt` for renewal logic.
 *
 * Exports a global `PC2SecureViewSession` with three methods:
 *   - persistSession({ token, sessionId, expiresAt })
 *   - loadSession()  → record or null if missing/expired
 *   - clearSession()
 */
/* global window, indexedDB */
(function initSecureViewSession(globalScope) {
  'use strict';

  var DB_NAME = 'pc2-secure-view';
  var DB_VERSION = 2;
  var STORE_SESS = 'session';
  var TOKEN_SLOT = 'current';

  // Legacy stores from the keypair-based version — dropped on upgrade.
  var LEGACY_STORE_KEYS = 'sessionKeys';
  var LEGACY_STORE_DELEGATIONS = 'delegations';

  // ── IndexedDB tiny promise wrapper ──────────────────────────────────────

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        // Migrate from v1 keypair schema: drop old stores, create the
        // single token-only store. Any existing keypair material becomes
        // unreachable — which is the point: the new flow has no use for it.
        if (db.objectStoreNames.contains(LEGACY_STORE_KEYS)) {
          db.deleteObjectStore(LEGACY_STORE_KEYS);
        }
        if (db.objectStoreNames.contains(LEGACY_STORE_DELEGATIONS)) {
          db.deleteObjectStore(LEGACY_STORE_DELEGATIONS);
        }
        if (!db.objectStoreNames.contains(STORE_SESS)) {
          db.createObjectStore(STORE_SESS);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(storeName, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(storeName, key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        var req = tx.objectStore(storeName).put(value, key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDel(storeName, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        var req = tx.objectStore(storeName).delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // ── Token persistence ───────────────────────────────────────────────────

  /**
   * Persist `{ token, sessionId, expiresAt }`. Called after a successful
   * /lit/complete-session or /lit/renew-session round-trip.
   */
  function persistSession(sessionRecord) {
    if (!sessionRecord || typeof sessionRecord.token !== 'string') {
      return Promise.reject(new Error('persistSession: sessionRecord.token required'));
    }
    return idbSet(STORE_SESS, TOKEN_SLOT, {
      token:     sessionRecord.token,
      sessionId: sessionRecord.sessionId,
      expiresAt: sessionRecord.expiresAt,
    });
  }

  /**
   * Load the stored session record. Resolves to null if no record exists or
   * if the delegation has expired — callers should then bootstrap a fresh
   * session.
   */
  function loadSession() {
    return idbGet(STORE_SESS, TOKEN_SLOT).then(function (rec) {
      if (!rec || !rec.token) return null;
      var now = Math.floor(Date.now() / 1000);
      if (rec.expiresAt && rec.expiresAt <= now) return null;
      return rec;
    });
  }

  /** Delete the stored session record (e.g. on wallet change or logout). */
  function clearSession() {
    return idbDel(STORE_SESS, TOKEN_SLOT);
  }

  globalScope.PC2SecureViewSession = {
    persistSession: persistSession,
    loadSession:    loadSession,
    clearSession:   clearSession,
  };

}(typeof globalThis !== 'undefined' ? globalThis : window));
