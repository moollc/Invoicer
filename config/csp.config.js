export const csp = {
  local: {
    'Content-Security-Policy': [
      "default-src 'self'",
      "frame-src 'self'",
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
  },
  production: {
    'Content-Security-Policy': [
      "default-src 'self'",
      "frame-src 'self'",
      "script-src 'self' https://accounts.google.com https://cdnjs.cloudflare.com",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }
};
