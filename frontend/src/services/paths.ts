const RESERVED_FIRST_SEGMENTS = new Set(['login', 'landing', 'csat', 'connect-channel', 'api', 'assets']);

export const CRM_TAB_SEGMENTS = new Set([
  'dashboard',
  'contacts',
  'broadcasts',
  'posts',
  'ideas',
  'media',
  'comments',
  'feed',
  'automations',
  'ai-agent',
  'birthday',
  'tracking',
  'conversations',
  'settings',
]);

export function getAppRootPath(pathname: string): string {
  const p = pathname || '/';
  const appMatch = p.match(/^(\/app\/[^/]+)(?:\/|$)/);
  if (appMatch) return `${appMatch[1]}/`;
  const proxyMatch = p.match(/^(\/api\/v1\/app-catalog\/proxy\/\d+)(?:\/|$)/);
  if (proxyMatch) return `${proxyMatch[1]}/`;
  return '/';
}

export function getRelativeSubpath(pathname: string): string {
  const root = getAppRootPath(pathname);
  if (root === '/') {
    return (pathname || '/').replace(/^\/+/, '').replace(/\/+$/, '');
  }
  const stripped = (pathname || '/').startsWith(root)
    ? pathname.slice(root.length)
    : (pathname || '/').replace(/^\/+/, '');
  return stripped.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function isLoginPathname(pathname: string): boolean {
  return getRelativeSubpath(pathname).toLowerCase() === 'login';
}

export function isLandingPathname(pathname: string): boolean {
  const rel = getRelativeSubpath(pathname).toLowerCase();
  return rel === '' || rel === 'landing';
}

export function isCsatPathname(pathname: string): boolean {
  return getRelativeSubpath(pathname).toLowerCase() === 'csat';
}

export function isConnectChannelPathname(pathname: string): boolean {
  return getRelativeSubpath(pathname).toLowerCase() === 'connect-channel';
}

export function getLoginPath(pathname: string): string {
  const root = getAppRootPath(pathname);
  return root === '/' ? '/login' : `${root}login`;
}

// Landing Page berada di path utama (root / atau /app/<slug>/), tanpa /landing
export function getLandingPath(pathname: string): string {
  return getAppRootPath(pathname);
}

export function getApiBaseUrl(pathname: string): string {
  const root = getAppRootPath(pathname);
  return root === '/' ? '/api' : `${root}api`;
}

export function toCompanySlug(rawSlug?: string | null, rawName?: string | null): string {
  const candidate = String(rawSlug || rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!candidate || RESERVED_FIRST_SEGMENTS.has(candidate) || CRM_TAB_SEGMENTS.has(candidate)) {
    return 'workspace';
  }
  return candidate;
}

export function parseCompanyAndTabFromPathname(pathname: string): {
  companySlug: string | null;
  tab: string | null;
  settingsSection: string | null;
} {
  const rel = getRelativeSubpath(pathname);
  if (!rel) return { companySlug: null, tab: null, settingsSection: null };
  const segs = rel.split('/').filter(Boolean);
  const first = segs[0]?.toLowerCase() || '';
  if (!first || RESERVED_FIRST_SEGMENTS.has(first)) {
    return { companySlug: null, tab: null, settingsSection: null };
  }
  // Format lama tanpa slug perusahaan: /contacts atau /settings/whatsapp
  if (CRM_TAB_SEGMENTS.has(first)) {
    return {
      companySlug: null,
      tab: first,
      settingsSection: first === 'settings' ? segs[1] || 'whatsapp' : null,
    };
  }
  // Format multi-usaha: /:companySlug/:tab atau /:companySlug/settings/:section
  const second = segs[1]?.toLowerCase() || '';
  if (second && CRM_TAB_SEGMENTS.has(second)) {
    return {
      companySlug: first,
      tab: second,
      settingsSection: second === 'settings' ? segs[2] || 'whatsapp' : null,
    };
  }
  // Hanya /:companySlug -> default ke dashboard perusahaan tersebut
  return {
    companySlug: first,
    tab: 'dashboard',
    settingsSection: null,
  };
}

export function buildTabPath(
  pathname: string,
  tab: string,
  settingsSection?: string,
  companySlug?: string | null
): string {
  const root = getAppRootPath(pathname);
  const cleanCompany = companySlug ? toCompanySlug(companySlug) : null;
  const tabPart = tab === 'settings' && settingsSection ? `settings/${settingsSection}` : tab;
  const suffix = cleanCompany ? `${cleanCompany}/${tabPart}` : tabPart;
  return root === '/' ? `/${suffix}` : `${root}${suffix}`;
}
