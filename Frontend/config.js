
// config.js - Centralized API configuration for CodeArena
const API_CONFIG = {
  BASE_URL: (() => {
    const hostname = window.location.hostname;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }

    const RENDER_BACKEND_URL = "https://codearena-eypt.onrender.com";
    return window.__API_BASE__ || RENDER_BACKEND_URL;
  })()
};
