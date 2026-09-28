let globalQuotaExceeded = false;

// Check if quota exceeded was recorded in localStorage or sessionStorage
try {
  if (typeof window !== 'undefined') {
    if (
      localStorage.getItem('firestore_quota_exceeded') === 'true' ||
      sessionStorage.getItem('firestore_quota_exceeded') === 'true'
    ) {
      globalQuotaExceeded = true;
    }
  }
} catch (e) {
  // ignore
}

export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err.stack || err || '');
  return (
    code.includes('resource-exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Free daily write units') ||
    msg.includes('Free daily read units') ||
    msg.includes('quota metric') ||
    msg.includes('maximum backoff delay')
  );
}

export function setQuotaExceeded(exceeded: boolean = true) {
  globalQuotaExceeded = exceeded;
  if (exceeded) {
    try {
      localStorage.setItem('firestore_quota_exceeded', 'true');
      sessionStorage.setItem('firestore_quota_exceeded', 'true');
    } catch (e) {
      // ignore
    }
  }
}

export function getQuotaExceeded(): boolean {
  if (globalQuotaExceeded) return true;
  try {
    if (
      localStorage.getItem('firestore_quota_exceeded') === 'true' ||
      sessionStorage.getItem('firestore_quota_exceeded') === 'true'
    ) {
      globalQuotaExceeded = true;
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

// Global console error filter to gracefully intercept Firebase SDK quota background logs
if (typeof window !== 'undefined' && !(window as any).__quotaConsolePatched) {
  (window as any).__quotaConsolePatched = true;
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    const fullMsg = args
      .map(arg => {
        if (!arg) return '';
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message + ' ' + (arg.stack || '');
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    if (isQuotaError(fullMsg) || (fullMsg.includes('@firebase/firestore') && (fullMsg.includes('quota') || fullMsg.includes('backoff')))) {
      setQuotaExceeded(true);
      console.warn('[Quota Circuit Breaker] Intercepted Firestore quota exceeded error. Operating in Local Storage mode.');
      return;
    }

    originalConsoleError.apply(console, args);
  };
}
