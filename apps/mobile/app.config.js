// Expo reads this in preference to app.json and is handed the static config as
// `config`, so app.json remains the single place the app is described and this
// file only overrides the TWO values that are MACHINE-SPECIFIC: `keycloakUrl`
// and `apiBaseUrl`. (`keycloakRealm` is not machine-specific and is left alone.)
//
// 🔴 WHY THIS FILE EXISTS. app.json's defaults are `10.0.2.2`, which is the
// Android EMULATOR's alias for the host loopback. On a PHYSICAL phone running
// Expo Go — the only way to run this app on a machine with no Android SDK —
// 10.0.2.2 resolves to nothing and every request fails with a network error
// that looks like a broken backend and is not one. A physical device needs the
// host's LAN address, which differs per machine and per network and therefore
// must never be committed into app.json.
//
// Usage:
//   MOBILE_HOST=192.168.0.124 npx expo start
//
// MOBILE_HOST sets both services at once because they always live on the same
// host in development; MOBILE_KEYCLOAK_URL / MOBILE_API_BASE_URL override each
// individually when they do not (e.g. a tunnelled Keycloak). Setting nothing
// leaves app.json's emulator defaults untouched, so this file cannot break the
// emulator path it does not apply to.
module.exports = ({ config }) => {
  const host = process.env.MOBILE_HOST;
  const extra = config.extra ?? {};

  return {
    ...config,
    extra: {
      ...extra,
      keycloakUrl:
        process.env.MOBILE_KEYCLOAK_URL ??
        (host ? `http://${host}:8080` : extra.keycloakUrl),
      apiBaseUrl:
        process.env.MOBILE_API_BASE_URL ??
        (host ? `http://${host}:4000` : extra.apiBaseUrl),
    },
  };
};
