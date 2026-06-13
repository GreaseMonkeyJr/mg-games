// Copyright (c) 2025-2026 Certago LLC. All rights reserved.
// MG Games - https://games.millersgarage.com
// Proprietary and confidential. See LICENSE for terms.

const PREFIX = "mg_games__";

const storage = {
  async get(key) {
    try {
      const val = localStorage.getItem(PREFIX + key);
      return val ? { key, value: val } : null;
    } catch { return null; }
  },
  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value };
    } catch { return null; }
  },
  async delete(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    } catch { return null; }
  },
  async list(prefix = "") {
    try {
      const keys = Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX + prefix))
        .map(k => k.slice(PREFIX.length));
      return { keys };
    } catch { return { keys: [] }; }
  },
};

window.storage = storage;