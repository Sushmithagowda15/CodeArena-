// config.js - Centralized API configuration for CodeArena
const API_CONFIG = {
  // If running locally, connect to local backend (http://localhost:3000).
  // When deployed to Cloudflare Pages, connect to the production Render backend.
  BASE_URL: (() => {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }
    // PLACEHOLDER: Replace this with your actual Render Web Service URL after deploying backend
    // Example: "https://codearena-backend.onrender.com"
    const RENDER_BACKEND_URL_PLACEHOLDER = "https://codearena-api.onrender.com";
    return window.__API_BASE__ || RENDER_BACKEND_URL_PLACEHOLDER;
  })()
};
