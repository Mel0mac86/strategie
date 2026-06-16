// Config dinamica: estende app.json e applica il base path di hosting
// (es. "/strategie" su GitHub Pages) solo quando EXPO_BASE_URL è impostato.
// In locale (npm run web) resta servito da "/".
const base = require("./app.json");

module.exports = () => {
  const config = { ...base.expo };
  const baseUrl = process.env.EXPO_BASE_URL;
  if (baseUrl) {
    config.experiments = { ...(config.experiments || {}), baseUrl };
  }
  return { expo: config };
};
