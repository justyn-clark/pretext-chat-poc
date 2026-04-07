import {
  clearCache as clearPretextCache,
  layout as pretextLayout,
  prepare as pretextPrepare,
} from '@chenglou/pretext';

const preparedCache = new Map();

const runtimeStats = {
  prepareCalls: 0,
  prepareHits: 0,
  prepareMisses: 0,
  layoutCalls: 0,
};

function cacheKeyFor(text, font, options) {
  return JSON.stringify([font, options?.whiteSpace ?? 'normal', text]);
}

export function prepare(text, font, options = {}) {
  runtimeStats.prepareCalls += 1;

  const cacheKey = cacheKeyFor(text, font, options);
  const cached = preparedCache.get(cacheKey);

  if (cached) {
    runtimeStats.prepareHits += 1;
    return cached;
  }

  runtimeStats.prepareMisses += 1;
  const prepared = pretextPrepare(text, font, options);
  preparedCache.set(cacheKey, prepared);
  return prepared;
}

export function layout(prepared, maxWidth, lineHeight) {
  runtimeStats.layoutCalls += 1;
  return pretextLayout(prepared, maxWidth, lineHeight);
}

export function resetRuntimeStats() {
  runtimeStats.prepareCalls = 0;
  runtimeStats.prepareHits = 0;
  runtimeStats.prepareMisses = 0;
  runtimeStats.layoutCalls = 0;
  preparedCache.clear();
  clearPretextCache();
}

export function getRuntimeStats() {
  return {
    ...runtimeStats,
    cacheSize: preparedCache.size,
  };
}
