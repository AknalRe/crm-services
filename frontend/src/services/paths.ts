const LEAF_ROUTE_REGEX = /\/(login|landing|csat|connect-channel)\/?$/i;

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
  const withoutLeaf = pathname.replace(LEAF_ROUTE_REGEX, '');
  const trimmed = withoutLeaf.replace(/\/+$/, '');
  if (!trimmed) return '/';
  return `${trimmed}/`;
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
