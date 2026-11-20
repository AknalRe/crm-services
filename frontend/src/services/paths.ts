const LEAF_ROUTE_REGEX = /\/(login|landing|csat|connect-channel)\/?$/i;

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

export function isLoginPathname(pathname: string): boolean {
  return /\/login\/?$/i.test(pathname);
}

export function isLandingPathname(pathname: string): boolean {
  return /\/landing\/?$/i.test(pathname);
}

export function isCsatPathname(pathname: string): boolean {
  return /\/csat\/?$/i.test(pathname);
}

export function isConnectChannelPathname(pathname: string): boolean {
  return /\/connect-channel\/?$/i.test(pathname);
}

export function getAppRootPath(pathname: string): string {
  const p = pathname || '/';
  const appMatch = p.match(/^(\/app\/[^/]+)(?:\/|$)/);
  if (appMatch) return `${appMatch[1]}/`;
  const proxyMatch = p.match(/^(\/api\/v1\/app-catalog\/proxy\/\d+)(?:\/|$)/);
  if (proxyMatch) return `${proxyMatch[1]}/`;
  const withoutLeaf = p.replace(LEAF_ROUTE_REGEX, '');
  const segs = withoutLeaf.split('/').filter(Boolean);
  if (segs.length > 0 && CRM_TAB_SEGMENTS.has(segs[0])) {
    return '/';
  }
  const trimmed = withoutLeaf.replace(/\/+$/, '');
  if (!trimmed) return '/';
  return `${trimmed}/`;
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

export function buildTabPath(pathname: string, tab: string, settingsSection?: string): string {
  const root = getAppRootPath(pathname);
  const suffix = tab === 'settings' && settingsSection ? `settings/${settingsSection}` : tab;
  return root === '/' ? `/${suffix}` : `${root}${suffix}`;
}

export function getLoginPath(pathname: string): string {
  const root = getAppRootPath(pathname);
  return root === '/' ? '/login' : `${root}login`;
}

export function getLandingPath(pathname: string): string {
  const root = getAppRootPath(pathname);
  return root === '/' ? '/landing' : `${root}landing`;
}

export function getApiBaseUrl(pathname: string): string {
  const root = getAppRootPath(pathname);
  return root === '/' ? '/api' : `${root}api`;
}
