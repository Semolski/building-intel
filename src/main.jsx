import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ── localStorage shim for window.storage ──────────────────────────────────
// The app was built with Claude's storage API. This makes it work identically
// when deployed outside Claude using standard browser localStorage instead.
if (!window.storage) {
  window.storage = {
    get: async (key) => {
      try {
        const v = localStorage.getItem(key);
        return v !== null ? { key, value: v } : null;
      } catch { return null; }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
        return { key, value };
      } catch { return null; }
    },
    delete: async (key) => {
      try {
        localStorage.removeItem(key);
        return { key, deleted: true };
      } catch { return null; }
    },
    list: async (prefix) => {
      try {
        const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
        return { keys };
      } catch { return { keys: [] }; }
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
