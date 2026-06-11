export const csp = {
  local: {
    'Content-Security-Policy': [
      "default-src 'self'",
      "frame-src 'self' https://accounts.google.com",
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://sheets.googleapis.com https://drive.googleapis.com https://mail.googleapis.com https://gmail.googleapis.com https://www.ecb.europa.eu https://cdnjs.cloudflare.com https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com https://api.deepseek.com https://openrouter.ai"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
  },
  production: {
    'Content-Security-Policy': [
      "default-src 'self'",
      "frame-src 'self' https://accounts.google.com",
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://sheets.googleapis.com https://drive.googleapis.com https://mail.googleapis.com https://gmail.googleapis.com https://www.ecb.europa.eu https://cdnjs.cloudflare.com https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com https://api.deepseek.com https://openrouter.ai"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }
};
