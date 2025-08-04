const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 });

exports.isAllowed = (userId, maxRequests = 100) => {
  const key = `rate_limit:${userId}`;
  const count = cache.get(key) || 0;
  if (count >= maxRequests) return false;
  cache.set(key, count + 1);
  return true;
};
