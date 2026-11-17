import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { contacts, conversations } from '../db/schema';
import { wahaService } from './waha.service';
import { liveEvents } from './events.service';
import { deleteProfilePictureFile, saveProfilePictureFile } from '../routes/media';
import { isGenericDisplayName } from '../routes/waha';

const PICTURE_REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_WITHOUT_PICTURE_MS = 20 * 60 * 1000;
const lastAttemptAt = new Map<string, number>();

export interface SyncWhatsAppProfileResult {
  updated: boolean;
  name: string | null;
  profilePictureUrl: string | null;
  profileAbout: string | null;
}

// Decide which display name to store for a contact after reading WAHA profile data
export function resolveProfileDisplayName(params: {
  isGroup: boolean;
  currentName: string;
  profileName?: string | null;
  profilePushName?: string | null;
}): string | null {
  const current = params.currentName.trim();
  if (params.isGroup) {
    const subject = (params.profileName || '').trim();
    if (subject && !isGenericDisplayName(subject) && subject !== current) return subject;
    return null;
  }
  if (!isGenericDisplayName(current)) return null;
  const candidates = [params.profileName, params.profilePushName];
  for (const raw of candidates) {
    const name = (raw || '').trim();
    if (name && !isGenericDisplayName(name) && name !== current) return name;
  }
  return null;
}

export async function syncWhatsAppProfile(params: {
  companyId: string;
  contactId: string;
  jid: string;
  session?: string | null;
  isGroup: boolean;
  force?: boolean;
}): Promise<SyncWhatsAppProfileResult> {
  const empty: SyncWhatsAppProfileResult = {
    updated: false,
    name: null,
    profilePictureUrl: null,
    profileAbout: null,
  };

  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, params.contactId), eq(contacts.companyId, params.companyId)))
    .limit(1);
  const contact = rows[0];
  if (!contact) return empty;

  const key = `${params.companyId}:${params.contactId}`;
  if (!params.force) {
    const last = lastAttemptAt.get(key) || 0;
    const ttl = contact.profilePictureUrl ? PICTURE_REFRESH_MS : RETRY_WITHOUT_PICTURE_MS;
    if (Date.now() - last < ttl) {
      return {
        ...empty,
        name: contact.namaLengkap,
        profilePictureUrl: contact.profilePictureUrl || null,
        profileAbout: contact.profileAbout || null,
      };
    }
  }
  lastAttemptAt.set(key, Date.now());

  const profile = await wahaService.getWhatsAppProfile(params.jid, params.session || undefined);
  if (!profile) {
    return {
      ...empty,
      name: contact.namaLengkap,
      profilePictureUrl: contact.profilePictureUrl || null,
      profileAbout: contact.profileAbout || null,
    };
  }

  const updates: Partial<typeof contacts.$inferInsert> = {};

  const nextName = resolveProfileDisplayName({
    isGroup: params.isGroup,
    currentName: contact.namaLengkap,
    profileName: profile.name,
    profilePushName: profile.pushName,
  });
  if (nextName) updates.namaLengkap = nextName;

  if (profile.about && profile.about !== contact.profileAbout) {
    updates.profileAbout = profile.about;
  }

  let previousPicture: string | null = null;
  if (profile.pictureUrl) {
    const downloaded = await wahaService.downloadProfilePicture(profile.pictureUrl);
    if (downloaded) {
      try {
        const saved = await saveProfilePictureFile({
          buffer: downloaded.buffer,
          mimeType: downloaded.contentType,
        });
        previousPicture = contact.profilePictureUrl || null;
        updates.profilePictureUrl = saved.relativeUrl;
      } catch {
        // keep previous photo when the new one cannot be stored
      }
    }
  }

  updates.profileSyncedAt = new Date();
  await db
    .update(contacts)
    .set(updates)
    .where(and(eq(contacts.id, contact.id), eq(contacts.companyId, params.companyId)));

  if (previousPicture) {
    await deleteProfilePictureFile(previousPicture);
  }

  const visibleChange = Boolean(
    updates.namaLengkap || updates.profilePictureUrl || updates.profileAbout
  );
  if (visibleChange) {
    if (params.isGroup && updates.namaLengkap) {
      await db
        .update(conversations)
        .set({ contextTitle: updates.namaLengkap, pushName: updates.namaLengkap })
        .where(
          and(
            eq(conversations.companyId, params.companyId),
            eq(conversations.contactId, contact.id),
            eq(conversations.isGroup, true)
          )
        );
    } else if (!params.isGroup) {
      const bestPersonalName = (updates.namaLengkap || profile.name || profile.pushName || '').trim();
      if (bestPersonalName && !isGenericDisplayName(bestPersonalName)) {
        const personConvs = await db
          .select({ id: conversations.id, pushName: conversations.pushName })
          .from(conversations)
          .where(
            and(
              eq(conversations.companyId, params.companyId),
              eq(conversations.contactId, contact.id),
              eq(conversations.isGroup, false)
            )
          );
        for (const pc of personConvs) {
          if (isGenericDisplayName(pc.pushName)) {
            await db
              .update(conversations)
              .set({ pushName: bestPersonalName })
              .where(eq(conversations.id, pc.id))
              .catch(() => {});
          }
        }
      }
    }
    const convRows = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.companyId, params.companyId), eq(conversations.contactId, contact.id))
      )
      .limit(10);
    for (const c of convRows) {
      liveEvents.emit('conversations:update', { conversationId: c.id }, params.companyId);
    }
  }

  return {
    updated: visibleChange,
    name: updates.namaLengkap || contact.namaLengkap,
    profilePictureUrl: updates.profilePictureUrl || contact.profilePictureUrl || null,
    profileAbout: updates.profileAbout || contact.profileAbout || null,
  };
}
