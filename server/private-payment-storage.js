const path = require('node:path');

function isPrivatePaymentStoragePath(value) {
  let pathname = String(value || '').split(/[?#]/, 1)[0];
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    } catch {
      break;
    }
  }
  pathname = path.posix.normalize('/' + pathname.replace(/\\/g, '/').replace(/^\/+/, '')).toLowerCase();
  return /^\/payment\/[^/]+\/(?:storage|private|backups?)(?:\/|$)/.test(pathname);
}

function blockPrivatePaymentStorage(req, res, next) {
  if (!isPrivatePaymentStoragePath(req.path || req.url)) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).type('text/plain').send('Not found');
}

module.exports = { isPrivatePaymentStoragePath, blockPrivatePaymentStorage };
