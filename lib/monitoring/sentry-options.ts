// Opsi Sentry bersama server + browser: hanya error, tanpa data pribadi.
// Cookie/header/body berisi sesi login dan data user, jadi tidak dikirim.
export const sentryOptions = {
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
  },
}
