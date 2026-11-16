/**
 * Utility functions for phone number normalization
 */

export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  
  // Remove spaces, hyphens, plus signs, brackets
  let cleaned = phone.replace(/[^0-9]/g, '');

  // Handle leading 0 (e.g. 0812... -> 62812...)
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  // Handle leading 8 (e.g. 812... -> 62812...)
  else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }

  return cleaned;
}

export function toWahaChatId(phone: string): string {
  const trimmed = (phone || '').trim();
  if (!trimmed) return '';
  const deviceJidMatch = trimmed.match(/^([^@\s:]+)(?::\d+)?@(s\.whatsapp\.net|c\.us|lid)$/i);
  if (deviceJidMatch) {
    const userPart = deviceJidMatch[1];
    const domain = deviceJidMatch[2].toLowerCase();
    return `${userPart}@${domain === 's.whatsapp.net' ? 'c.us' : domain}`;
  }
  if (/^[^@\s]+@(g\.us|broadcast)$/i.test(trimmed)) {
    return trimmed;
  }
  const normalized = normalizePhoneNumber(trimmed);
  if (!normalized) return '';
  if (!normalized.endsWith('@c.us')) {
    return `${normalized}@c.us`;
  }
  return normalized;
}

export function fromWahaChatId(chatId: string): string {
  const withoutDomain = String(chatId || '')
    .trim()
    .replace(/@(c\.us|s\.whatsapp\.net|lid|g\.us|broadcast|newsletter)$/i, '');
  const colonIdx = withoutDomain.indexOf(':');
  return colonIdx !== -1 ? withoutDomain.slice(0, colonIdx) : withoutDomain;
}

export function isPhoneWahaJid(jid: string): boolean {
  const clean = String(jid || '').trim().toLowerCase();
  return clean.endsWith('@c.us') || clean.endsWith('@s.whatsapp.net');
}

export function isPersonalWahaJid(jid: string): boolean {
  const clean = String(jid || '').trim().toLowerCase();
  return isPhoneWahaJid(clean) || clean.endsWith('@lid');
}

