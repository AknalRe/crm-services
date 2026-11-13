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
  const normalized = normalizePhoneNumber(phone);
  if (!normalized.endsWith('@c.us')) {
    return `${normalized}@c.us`;
  }
  return normalized;
}

export function fromWahaChatId(chatId: string): string {
  return chatId.replace('@c.us', '').replace('@s.whatsapp.net', '');
}

