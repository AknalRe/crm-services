import axios from 'axios';
import {
  Contact,
  Campaign,
  CampaignRecipient,
  Conversation,
  ChatMessage,
  DashboardStats,
  WahaStatus,
  WahaSessionItem,
  WahaPrivacyConfig,
  BirthdaySetting,
  LicenseInfo,
  AuthStatus,
  LicensePlan,
  LicenseOrder,
  PaymentMethodItem,
  AgentItem,
  AgentQuota,
  CrmRoleItem,
  PermissionCatalogItem,
  CrmSlaCsatSettings,
  CannedResponse,
  PaginationMeta,
  SavedStickerItem,
} from '../types';
import { getApiBaseUrl } from './paths';

const client = axios.create({
  baseURL: typeof window !== 'undefined' ? getApiBaseUrl(window.location.pathname) : './api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Dashboard
  getDashboardStats: async (params?: {
    period?: string;
    startDate?: string;
    endDate?: string;
    session?: string;
    channel?: string;
  }): Promise<DashboardStats> => {
    const res = await client.get('/dashboard/stats', { params });
    return res.data.data;
  },
  getDashboardDrilldown: async (params: {
    kind: import('../types').DashboardDrilldownKind;
    filter?: string;
    value?: string;
    q?: string;
    period?: string;
    startDate?: string;
    endDate?: string;
    session?: string;
    channel?: string;
  }): Promise<import('../types').DashboardDrilldownResponse> => {
    const res = await client.get('/dashboard/drilldown', { params });
    return res.data.data;
  },

  // Contacts
  getContacts: async (params?: {
    search?: string;
    tag?: string;
    kategori?: string;
    excludeFromMetrics?: 'ALL' | 'ASSESSED' | 'EXCLUDED';
    hasWhatsapp?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ data: Contact[]; pagination: PaginationMeta }> => {
    const res = await client.get('/contacts', { params });
    return res.data;
  },
  getContactIds: async (params?: {
    search?: string;
    tag?: string;
    kategori?: string;
    excludeFromMetrics?: 'ALL' | 'ASSESSED' | 'EXCLUDED';
  }): Promise<{ ids: string[]; pagination: PaginationMeta }> => {
    const res = await client.get('/contacts', { params: { ...params, idsOnly: '1' } });
    return {
      ids: res.data.data || [],
      pagination: res.data.pagination,
    };
  },
  getContact: async (id: string): Promise<Contact> => {
    const res = await client.get(`/contacts/${id}`);
    return res.data.data;
  },
  createContact: async (data: Partial<Contact>): Promise<Contact> => {
    const res = await client.post('/contacts', data);
    return res.data.data;
  },
  updateContact: async (id: string, data: Partial<Contact>): Promise<Contact> => {
    const res = await client.put(`/contacts/${id}`, data);
    return res.data.data;
  },
  deleteContact: async (id: string): Promise<void> => {
    await client.delete(`/contacts/${id}`);
  },
  bulkImportContacts: async (contacts: Partial<Contact>[]): Promise<any> => {
    const res = await client.post('/contacts/bulk', { contacts });
    return res.data;
  },
  getContactTags: async (): Promise<string[]> => {
    const res = await client.get('/contacts/meta/tags');
    return res.data.data;
  },
  syncWhatsAppContacts: async (payload?: {
    session?: string;
    overwriteNames?: boolean;
  }): Promise<{
    sessionUsed: string;
    totalFetched: number;
    created: number;
    updated: number;
    skipped: number;
    quotaStopped: boolean;
    currentTotal?: number;
    maxContacts?: number;
  }> => {
    const res = await client.post('/contacts/sync-whatsapp', payload || {}, {
      timeout: 120000,
    });
    return res.data.data;
  },
  syncContactProfile: async (
    id: string,
    session?: string
  ): Promise<{ updated: boolean; contact: Contact }> => {
    const res = await client.post(`/contacts/${id}/sync-profile`, session ? { session } : {});
    return res.data.data;
  },

  // Campaigns & Broadcasts
  getCampaigns: async (params?: {
    status?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<Campaign[]> => {
    const res = await client.get('/broadcasts', { params });
    return res.data.data;
  },
  getCampaignsPaged: async (params?: {
    status?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Campaign[]; pagination: PaginationMeta }> => {
    const res = await client.get('/broadcasts', { params });
    return {
      data: res.data.data || [],
      pagination: res.data.pagination || {
        page: params?.page || 1,
        limit: params?.limit || 25,
        total: (res.data.data || []).length,
        totalPages: 1,
      },
    };
  },
  getCampaign: async (id: string): Promise<Campaign & { recipients: CampaignRecipient[] }> => {
    const res = await client.get(`/broadcasts/${id}`);
    return res.data.data;
  },
  createCampaign: async (data: {
    title: string;
    messageTemplate: string;
    type?: string;
    scheduledAt?: string | null;
    delaySeconds?: number;
    intervalSeconds?: number;
    batchSize?: number;
    contactIds?: string[];
    filterTags?: string[];
    channel?: import('../types').OmnichannelType;
    channelAccountId?: string | null;
    sessionName?: string;
  }): Promise<any> => {
    const res = await client.post('/broadcasts', data);
    return res.data;
  },
  cancelCampaign: async (id: string): Promise<any> => {
    const res = await client.post(`/broadcasts/${id}/cancel`);
    return res.data;
  },
  retryFailedCampaign: async (id: string): Promise<{ retriedCount: number }> => {
    const res = await client.post(`/broadcasts/${id}/retry-failed`);
    return res.data.data;
  },
  deleteCampaign: async (id: string): Promise<any> => {
    const res = await client.delete(`/broadcasts/${id}`);
    return res.data;
  },
  getRecipientTracking: async (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: CampaignRecipient[]; pagination: PaginationMeta }> => {
    const res = await client.get('/broadcasts/tracking/recipients', { params });
    return res.data;
  },

  // Conversations (CRM Live Chat)
  getConversations: async (): Promise<Conversation[]> => {
    const res = await client.get('/conversations');
    return res.data.data;
  },
  getConversationMessages: async (
    id: string,
    opts?: { markRead?: boolean; forceSeen?: boolean }
  ): Promise<ChatMessage[]> => {
    const params: Record<string, string> = {};
    if (opts?.markRead === false) params.markRead = 'false';
    if (opts?.forceSeen) params.forceSeen = '1';
    const res = await client.get(`/conversations/${id}/messages`, { params });
    return res.data.data;
  },
  getConversationMessagesPage: async (
    id: string,
    opts?: { markRead?: boolean; forceSeen?: boolean; limit?: number; before?: string }
  ): Promise<{ items: ChatMessage[]; hasMore: boolean }> => {
    const params: Record<string, string> = {};
    if (opts?.markRead === false) params.markRead = 'false';
    if (opts?.forceSeen) params.forceSeen = '1';
    if (opts?.limit) params.limit = String(opts.limit);
    if (opts?.before) params.before = opts.before;
    const res = await client.get(`/conversations/${id}/messages`, { params });
    return {
      items: res.data.data || [],
      hasMore: Boolean(res.data.hasMore),
    };
  },
  syncConversationHistory: async (
    id: string,
    opts?: { offset?: number; limit?: number }
  ): Promise<{ inserted: number; acksUpdated: number; fetchedCount: number; hasMoreOnWaha: boolean }> => {
    const res = await client.post(`/conversations/${id}/sync-history`, opts || {});
    return res.data.data;
  },
  markConversationRead: async (
    id: string
  ): Promise<{ seenSent: boolean; skippedByPrivacy?: boolean; error?: string }> => {
    const res = await client.post(`/conversations/${id}/read`);
    return res.data.data || { seenSent: false };
  },
  syncConversationProfile: async (
    id: string,
    session?: string
  ): Promise<{
    updated: boolean;
    name?: string | null;
    profile_picture_url?: string | null;
    profile_about?: string | null;
  }> => {
    const res = await client.post(`/conversations/${id}/sync-profile`, session ? { session } : {});
    return res.data.data;
  },
  sendConversationTyping: async (
    id: string,
    typing: boolean,
    session?: string
  ): Promise<{ success: boolean }> => {
    const res = await client.post(`/conversations/${id}/typing`, {
      typing,
      ...(session ? { session } : {}),
    });
    return res.data;
  },
  sendConversationMessage: async (
    id: string,
    payload: {
      body?: string;
      session?: string;
      mediaBase64?: string;
      mediaMimetype?: string;
      mediaName?: string;
      mediaUrl?: string;
      replyToMessageId?: string;
      mentions?: string[];
      asDocument?: boolean;
      isHd?: boolean;
      isForwarded?: boolean;
      forwardedFromSender?: string;
      forwardedFromChannel?: string;
      messageKind?: 'TEXT' | 'MEDIA' | 'STICKER' | 'LOCATION' | 'CONTACT' | 'LINK_PREVIEW' | 'BUTTONS' | 'POLL';
      linkPreview?: {
        url: string;
        title?: string;
        description?: string;
        caption?: string;
        imageUrl?: string;
        highQuality?: boolean;
      };
      interactiveButtons?: {
        header?: string;
        body: string;
        footer?: string;
        fallbackTextOnUnsupported?: boolean;
        buttons: Array<{
          type: 'reply' | 'url' | 'call' | 'copy';
          text: string;
          url?: string;
          phoneNumber?: string;
          copyCode?: string;
        }>;
      };
      poll?: {
        question: string;
        options: string[];
        multipleAnswers?: boolean;
      };
      location?: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
      };
      sharedContacts?: Array<{
        fullName: string;
        phoneNumber: string;
        organization?: string;
        email?: string;
      }>;
    }
  ): Promise<ChatMessage> => {
    const res = await client.post(`/conversations/${id}/messages`, payload);
    return res.data.data;
  },
  reactToConversationMessage: async (
    conversationId: string,
    messageId: string,
    emoji: string,
    session?: string
  ): Promise<ChatMessage> => {
    const res = await client.post(`/conversations/${conversationId}/messages/${messageId}/reaction`, {
      emoji,
      ...(session ? { session } : {}),
    });
    return res.data.data;
  },
  getStickers: async (): Promise<SavedStickerItem[]> => {
    const res = await client.get('/conversations/stickers');
    return res.data.data || [];
  },
  getStickerCatalog: async (): Promise<{
    saved: SavedStickerItem[];
    whatsappStickers: Array<SavedStickerItem & { wahaSession?: string | null; senderName?: string | null }>;
  }> => {
    const res = await client.get('/conversations/stickers');
    return {
      saved: res.data.data || [],
      whatsappStickers: res.data.whatsappStickers || [],
    };
  },
  saveSticker: async (payload: {
    name?: string;
    mediaBase64?: string;
    mimetype?: string;
    mediaUrl?: string;
  }): Promise<{ sticker: SavedStickerItem; alreadyExists?: boolean }> => {
    const res = await client.post('/conversations/stickers', payload);
    return {
      sticker: res.data.data,
      alreadyExists: Boolean(res.data.alreadyExists),
    };
  },
  deleteSticker: async (stickerId: string): Promise<void> => {
    await client.delete(`/conversations/stickers/${stickerId}`);
  },
  saveSharedContact: async (payload: {
    fullName: string;
    phoneNumber: string;
    organization?: string;
    openConversation?: boolean;
    session?: string;
  }): Promise<{ contact: Contact; createdNew: boolean; conversation?: Conversation | null }> => {
    const res = await client.post('/conversations/save-shared-contact', payload);
    return res.data.data;
  },
  retryConversationMessage: async (
    conversationId: string,
    messageId: string,
    session?: string
  ): Promise<{ success: boolean; error?: string; data: ChatMessage }> => {
    const res = await client.post(`/conversations/${conversationId}/messages/${messageId}/retry`, {
      ...(session ? { session } : {}),
    });
    return res.data;
  },
  deleteConversationMessage: async (
    conversationId: string,
    messageId: string,
    scope: 'ME' | 'EVERYONE',
    session?: string
  ): Promise<{ deletedId: string; scope: 'ME' | 'EVERYONE' }> => {
    const res = await client.delete(`/conversations/${conversationId}/messages/${messageId}`, {
      params: {
        scope,
        ...(session ? { session } : {}),
      },
    });
    return res.data.data;
  },
  forwardConversationMessage: async (
    conversationId: string,
    payload: {
      sourceMessageId: string;
      targetConversationId?: string;
      session?: string;
    }
  ): Promise<ChatMessage> => {
    const res = await client.post(`/conversations/${conversationId}/messages/forward`, payload);
    return res.data.data;
  },
  pinConversationMessage: async (
    conversationId: string,
    messageId: string,
    payload?: { duration?: number; unpin?: boolean }
  ): Promise<{ success: boolean; isPinned: boolean; data: ChatMessage; warning?: string }> => {
    const res = await client.post(`/conversations/${conversationId}/messages/${messageId}/pin`, payload || {});
    return res.data;
  },
  starConversationMessage: async (
    conversationId: string,
    messageId: string
  ): Promise<{ success: boolean; isStarred: boolean; data: ChatMessage; warning?: string }> => {
    const res = await client.post(`/conversations/${conversationId}/messages/${messageId}/star`);
    return res.data;
  },
  updateGroupSubject: async (
    conversationId: string,
    subject: string,
    session?: string
  ): Promise<{ success: boolean; subject: string }> => {
    const res = await client.put(`/conversations/${conversationId}/group/subject`, {
      subject,
      ...(session ? { session } : {}),
    });
    return res.data;
  },
  updateGroupDescription: async (
    conversationId: string,
    description: string,
    session?: string
  ): Promise<{ success: boolean; description: string }> => {
    const res = await client.put(`/conversations/${conversationId}/group/description`, {
      description,
      ...(session ? { session } : {}),
    });
    return res.data;
  },
  updateGroupPicture: async (
    conversationId: string,
    file: string,
    session?: string
  ): Promise<{ success: boolean }> => {
    const res = await client.post(`/conversations/${conversationId}/group/picture`, {
      file,
      ...(session ? { session } : {}),
    });
    return res.data;
  },
  getGroupInviteCode: async (
    conversationId: string,
    session?: string
  ): Promise<{ success: boolean; code?: string; link?: string }> => {
    const res = await client.get(`/conversations/${conversationId}/group/invite-code`, {
      params: session ? { session } : {},
    });
    return res.data;
  },
  revokeGroupInviteCode: async (
    conversationId: string,
    session?: string
  ): Promise<{ success: boolean; code?: string; link?: string }> => {
    const res = await client.post(`/conversations/${conversationId}/group/invite-code/revoke`, {
      session,
    });
    return res.data;
  },
  addGroupParticipants: async (
    conversationId: string,
    participants: string[],
    session?: string
  ): Promise<{ success: boolean }> => {
    const res = await client.post(`/conversations/${conversationId}/group/participants/add`, {
      participants,
      session,
    });
    return res.data;
  },
  updateConversation: async (
    id: string,
    payload: {
      status?: 'OPEN' | 'PENDING' | 'RESOLVED';
      labels?: string | null;
      wahaSession?: string | null;
      channelDisplayName?: string | null;
      excludeFromMetrics?: boolean;
      excludeReason?: string | null;
      applyToContact?: boolean;
      contactNotes?: string | null;
      contactTags?: string | null;
      assignedAgentId?: string | null;
      sendCsat?: boolean;
      baseUrl?: string;
    }
  ): Promise<{ csatSent?: boolean }> => {
    const res = await client.patch(`/conversations/${id}`, payload);
    return res.data.data || {};
  },
  getConversationParticipants: async (
    id: string,
    sync = true
  ): Promise<import('../types').ConversationParticipantsResponse> => {
    const res = await client.get(`/conversations/${id}/participants`, {
      params: { sync: sync ? 'true' : 'false' },
    });
    return res.data.data;
  },
  addConversationNote: async (id: string, body: string): Promise<ChatMessage> => {
    const res = await client.post(`/conversations/${id}/notes`, { body });
    return res.data.data;
  },
  sendConversationCsatCta: async (
    id: string,
    payload: { session?: string; baseUrl?: string; customMessage?: string }
  ): Promise<{ message: ChatMessage; csatUrl: string; csatToken: string }> => {
    const res = await client.post(`/conversations/${id}/csat-cta`, payload);
    return res.data.data;
  },
  getPublicCsat: async (
    token: string
  ): Promise<{
    contactName: string;
    agentName?: string | null;
    wahaSession?: string | null;
    profileName?: string;
    texts?: import('../types').CsatTextConfig;
    criteria?: import('../types').CsatCriterion[];
    alreadyRated: boolean;
    rating?: number | null;
    overallScore?: number | null;
    criteriaScores?: Record<string, number>;
    criteriaDetails?: import('../types').CsatCriterionScoreDetail[];
    feedback?: string | null;
    submittedAt?: string | null;
  }> => {
    const res = await client.get(`/public/csat/${encodeURIComponent(token)}`);
    return res.data.data;
  },
  submitPublicCsat: async (
    token: string,
    payload: { rating?: number; criteriaScores?: Record<string, number>; feedback?: string }
  ): Promise<any> => {
    const res = await client.post(`/public/csat/${encodeURIComponent(token)}`, payload);
    return res.data;
  },

  // WAHA & WhatsApp Integration
  getWahaStatus: async (): Promise<WahaStatus> => {
    const res = await client.get('/waha/status');
    return res.data.data;
  },
  getWahaLogs: async (): Promise<
    Array<{
      receivedAt: string;
      event: string;
      session?: string | null;
      from?: string | null;
      outcome: 'PROCESSED' | 'DEDUP' | 'IGNORED' | 'ERROR';
      statusCode?: number | null;
      note?: string;
      payload?: unknown;
    }>
  > => {
    const res = await client.get('/waha/logs');
    return res.data.data || [];
  },
  clearWahaLogs: async (): Promise<void> => {
    await client.delete('/waha/logs');
  },
  getWahaQr: async (session?: string): Promise<{ qr?: string; status: string; error?: string }> => {
    const res = await client.get('/waha/qr', { params: session ? { session } : undefined });
    return res.data.data;
  },
  getWahaSessions: async (): Promise<{ sessions: WahaSessionItem[]; activeSession: string }> => {
    const res = await client.get('/waha/sessions');
    return res.data.data;
  },
  createWahaSession: async (name: string, setActive = true): Promise<any> => {
    const res = await client.post('/waha/sessions', { name, setActive });
    return res.data.data;
  },
  setActiveWahaSession: async (session: string): Promise<any> => {
    const res = await client.post('/waha/sessions/active', { session });
    return res.data.data;
  },
  deleteWahaSession: async (name: string): Promise<any> => {
    const res = await client.delete(`/waha/sessions/${encodeURIComponent(name)}`);
    return res.data.data;
  },
  startWahaSession: async (session?: string): Promise<any> => {
    const res = await client.post('/waha/session/start', session ? { session } : undefined);
    return res.data.data;
  },
  stopWahaSession: async (session?: string): Promise<any> => {
    const res = await client.post('/waha/session/stop', session ? { session } : undefined);
    return res.data.data;
  },
  logoutWahaSession: async (session?: string): Promise<any> => {
    const res = await client.post('/waha/session/logout', session ? { session } : undefined);
    return res.data.data;
  },
  updateWahaSettings: async (data: {
    mode?: 'INTERNAL' | 'EXTERNAL';
    baseUrl?: string;
    apiKey?: string;
    session?: string;
    webhookUrl?: string;
  }): Promise<any> => {
    const res = await client.post('/settings/waha', data);
    return res.data;
  },
  syncWahaWebhooks: async (): Promise<{ webhookUrl: string; synced: string[]; skippedReason?: string }> => {
    const res = await client.post('/waha/webhook/sync');
    return res.data.data;
  },
  testWahaConnection: async (data?: {
    mode?: 'INTERNAL' | 'EXTERNAL';
    baseUrl?: string;
    apiKey?: string;
  }): Promise<{
    connected: boolean;
    mode: 'INTERNAL' | 'EXTERNAL';
    baseUrl: string;
    version?: string | null;
    tier?: string | null;
    engine?: string | null;
    isGows?: boolean;
    sessionCount: number;
    sessions: Array<{ name: string; status: string }>;
  }> => {
    const res = await client.post('/settings/waha/test', data || {});
    return res.data.data;
  },
  sendTestMessage: async (phone: string, message: string, session?: string): Promise<any> => {
    const res = await client.post('/waha/send-test', {
      phone,
      message,
      ...(session ? { session } : {}),
    });
    return res.data;
  },

  // Birthday Automation
  getBirthdaySettings: async (): Promise<{ setting: BirthdaySetting; celebrants: { today: Contact[]; totalRegistered: number } }> => {
    const res = await client.get('/settings/birthday');
    return res.data.data;
  },
  updateBirthdaySettings: async (data: Partial<BirthdaySetting>): Promise<any> => {
    const res = await client.post('/settings/birthday', data);
    return res.data;
  },
  triggerBirthdayGreetings: async (): Promise<any> => {
    const res = await client.post('/settings/birthday/trigger');
    return res.data;
  },

  // Auth & Initial Setup
  getAuthStatus: async (): Promise<AuthStatus> => {
    const res = await client.get('/auth/status');
    return res.data.data;
  },
  // CRM CSAT Template & SLA Settings
  getCrmSettings: async (): Promise<CrmSlaCsatSettings> => {
    const res = await client.get('/settings');
    return res.data.data.crm;
  },
  updateCrmSettings: async (data: Partial<CrmSlaCsatSettings>): Promise<CrmSlaCsatSettings> => {
    const res = await client.post('/settings/crm', data);
    return res.data.data;
  },
  getWahaPrivacy: async (): Promise<WahaPrivacyConfig> => {
    const res = await client.get('/settings/waha/privacy');
    return res.data.data;
  },
  updateWahaPrivacy: async (payload: Partial<WahaPrivacyConfig>): Promise<WahaPrivacyConfig> => {
    const res = await client.put('/settings/waha/privacy', payload);
    return res.data.data;
  },

  // Multi-Agent & Role Management
  getAgents: async (): Promise<{
    agents: AgentItem[];
    roles: CrmRoleItem[];
    permissionCatalog: PermissionCatalogItem[];
    quota: AgentQuota;
  }> => {
    const res = await client.get('/agents');
    return res.data.data;
  },
  createAgent: async (data: {
    name: string;
    email: string;
    password: string;
    role?: 'ADMIN' | 'AGENT';
    roleId?: string | null;
    permissions?: string[];
  }): Promise<AgentItem> => {
    const res = await client.post('/agents', data);
    return res.data.data;
  },
  updateAgent: async (
    id: string,
    data: {
      name?: string;
      email?: string;
      password?: string;
      role?: 'ADMIN' | 'AGENT';
      roleId?: string | null;
      permissions?: string[];
      isActive?: boolean;
    }
  ): Promise<AgentItem> => {
    const res = await client.patch(`/agents/${id}`, data);
    return res.data.data;
  },
  deleteAgent: async (id: string): Promise<void> => {
    await client.delete(`/agents/${id}`);
  },
  getRoles: async (): Promise<{ roles: CrmRoleItem[]; permissionCatalog: PermissionCatalogItem[] }> => {
    const res = await client.get('/agents/roles');
    return res.data.data;
  },
  createRole: async (data: {
    name: string;
    description?: string | null;
    permissions: string[];
  }): Promise<CrmRoleItem> => {
    const res = await client.post('/agents/roles', data);
    return res.data.data;
  },
  updateRole: async (
    roleId: string,
    data: {
      name?: string;
      description?: string | null;
      permissions?: string[];
    }
  ): Promise<CrmRoleItem> => {
    const res = await client.patch(`/agents/roles/${roleId}`, data);
    return res.data.data;
  },
  deleteRole: async (roleId: string): Promise<void> => {
    await client.delete(`/agents/roles/${roleId}`);
  },

  // Open Conversation with any contact or phone
  openConversation: async (
    contactId?: string,
    session?: string,
    phone?: string,
    name?: string
  ): Promise<Conversation> => {
    const res = await client.post('/conversations/open', { contactId, session, phone, name });
    return res.data.data;
  },

  // Assignable Agents & Canned Responses
  getAssignableAgents: async (): Promise<Array<{ id: string; name: string; email: string; role: string }>> => {
    const res = await client.get('/conversations/agents');
    return res.data.data;
  },
  getCannedResponses: async (activeOnly = false): Promise<CannedResponse[]> => {
    const res = await client.get('/conversations/canned', {
      params: activeOnly ? { activeOnly: 'true' } : undefined,
    });
    return res.data.data;
  },
  createCannedResponse: async (data: {
    shortCode: string;
    title: string;
    category?: string;
    content: string;
    isActive?: boolean;
  }): Promise<CannedResponse> => {
    const res = await client.post('/conversations/canned', data);
    return res.data.data;
  },
  updateCannedResponse: async (
    id: string,
    data: Partial<{ shortCode: string; title: string; category: string; content: string; isActive: boolean }>
  ): Promise<CannedResponse> => {
    const res = await client.patch(`/conversations/canned/${id}`, data);
    return res.data.data;
  },
  deleteCannedResponse: async (id: string): Promise<void> => {
    await client.delete(`/conversations/canned/${id}`);
  },
  setupAuth: async (payload: { name: string; email: string; password: string }): Promise<{ user: { name: string; email: string } }> => {
    const res = await client.post('/auth/setup', payload);
    return res.data.data;
  },
  registerCompany: async (payload: {
    companyName: string;
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ user: { name: string; email: string } }> => {
    const res = await client.post('/auth/register-company', payload);
    return res.data.data;
  },
  loginAuth: async (payload: { email: string; password: string }): Promise<{ user: { name: string; email: string } }> => {
    const res = await client.post('/auth/login', payload);
    return res.data.data;
  },
  logoutAuth: async (): Promise<void> => {
    await client.post('/auth/logout');
  },

  // License & Reneo Subscription
  getLicenseStatus: async (): Promise<LicenseInfo> => {
    const res = await client.get('/license/status');
    return res.data.data;
  },
  syncLicense: async (): Promise<LicenseInfo> => {
    const res = await client.post('/license/sync');
    return res.data.data;
  },
  activateLicense: async (licenseKey: string): Promise<LicenseInfo> => {
    const res = await client.post('/license/activate', { licenseKey });
    return res.data.data;
  },
  getLicensePlans: async (): Promise<LicensePlan[]> => {
    const res = await client.get('/license/plans');
    return res.data.data;
  },
  startLicenseTrial: async (planSlug: string, buyerPhone?: string): Promise<LicenseInfo> => {
    const res = await client.post('/license/trial', { planSlug, buyerPhone });
    return res.data.data;
  },
  submitPublicInquiry: async (payload: {
    name: string;
    phone: string;
    businessName?: string;
    inquiryType: string;
    message: string;
  }): Promise<{ success: boolean; message: string }> => {
    const res = await client.post('/public/seo/inquiry', payload);
    return res.data;
  },
  createLicenseOrder: async (data: {
    planSlug: string;
    quantity?: number;
    buyerName?: string;
    buyerEmail?: string;
    buyerPhone?: string;
    paymentMethod?: string;
  }): Promise<{ order: LicenseOrder; paymentMethods: PaymentMethodItem[]; invoiceUrl: string }> => {
    const res = await client.post('/license/order', data);
    return res.data;
  },
  getLicenseOrder: async (publicId: string): Promise<{ order: LicenseOrder; paymentMethods: PaymentMethodItem[] }> => {
    const res = await client.get(`/license/order/${publicId}`);
    return res.data;
  },
  payLicenseOrder: async (publicId: string, paymentMethod = 'saldo'): Promise<{ order: LicenseOrder }> => {
    const res = await client.post(`/license/order/${publicId}/pay`, { paymentMethod });
    return res.data;
  },

  // Automation, Routing & SLA Escalation
  getAutomationSettings: async (): Promise<{
    config: import('../types').AutomationConfig;
    rules: import('../types').AutoReplyRule[];
  }> => {
    const res = await client.get('/settings/automation');
    return res.data.data;
  },
  saveAutomationSettings: async (
    data: Partial<import('../types').AutomationConfig>
  ): Promise<void> => {
    await client.post('/settings/automation', data);
  },
  createAutoReplyRule: async (data: {
    keyword: string;
    matchType?: 'CONTAINS' | 'EXACT' | 'STARTS_WITH';
    replyText: string;
    priority?: number;
  }): Promise<import('../types').AutoReplyRule> => {
    const res = await client.post('/settings/auto-replies', data);
    return res.data.data;
  },
  updateAutoReplyRule: async (
    id: string,
    data: Partial<import('../types').AutoReplyRule>
  ): Promise<import('../types').AutoReplyRule> => {
    const res = await client.patch(`/settings/auto-replies/${id}`, data);
    return res.data.data;
  },
  deleteAutoReplyRule: async (id: string): Promise<void> => {
    await client.delete(`/settings/auto-replies/${id}`);
  },

  // Product Catalog (Quick Quote)
  getProducts: async (activeOnly = false): Promise<import('../types').ProductItem[]> => {
    const res = await client.get('/products', { params: activeOnly ? { activeOnly: 'true' } : undefined });
    return res.data.data || [];
  },
  createProduct: async (data: {
    sku?: string;
    name: string;
    category?: string;
    price: number;
    unit?: string;
    description?: string;
  }): Promise<import('../types').ProductItem> => {
    const res = await client.post('/products', data);
    return res.data.data;
  },
  updateProduct: async (
    id: string,
    data: Partial<import('../types').ProductItem>
  ): Promise<import('../types').ProductItem> => {
    const res = await client.patch(`/products/${id}`, data);
    return res.data.data;
  },
  deleteProduct: async (id: string): Promise<void> => {
    await client.delete(`/products/${id}`);
  },

  // Reports Export
  downloadDashboardExport: async (
    type: 'agents' | 'conversations' | 'broadcasts',
    params?: { period?: string; session?: string; channel?: string }
  ): Promise<void> => {
    const res = await client.get('/dashboard/export', {
      params: { type, ...params },
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      type === 'agents'
        ? 'laporan-performa-agent-crm.csv'
        : type === 'broadcasts'
        ? 'laporan-broadcast-crm.csv'
        : 'laporan-percakapan-crm.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Omnichannel Accounts
  getChannels: async (): Promise<import('../types').ChannelAccount[]> => {
    const res = await client.get('/channels');
    return res.data.data || [];
  },
  createChannel: async (data: {
    channel: import('../types').OmnichannelType;
    name: string;
    accountId: string;
    accessToken?: string;
    verifyToken?: string;
  }): Promise<import('../types').ChannelAccount> => {
    const res = await client.post('/channels', data);
    return res.data.data;
  },
  updateChannel: async (
    id: string,
    data: Partial<{ name: string; accountId: string; accessToken: string; isActive: boolean }>
  ): Promise<import('../types').ChannelAccount> => {
    const res = await client.patch(`/channels/${id}`, data);
    return res.data.data;
  },
  deleteChannel: async (id: string): Promise<void> => {
    await client.delete(`/channels/${id}`);
  },
  getChannelConnectLinks: async (): Promise<import('../types').ChannelConnectLink[]> => {
    const res = await client.get('/channels/connect-links');
    return res.data.data || [];
  },
  createChannelConnectLink: async (data: {
    channel: import('../types').OmnichannelType;
    label?: string;
    expiresHours?: number;
  }): Promise<import('../types').ChannelConnectLink> => {
    const res = await client.post('/channels/connect-links', data);
    return res.data.data;
  },
  getPublicConnectLink: async (token: string): Promise<{
    channel: import('../types').OmnichannelType;
    label?: string | null;
    expiresAt: string;
    usedAt?: string | null;
    isExpired: boolean;
  }> => {
    const res = await client.get(`/channels/connect/${encodeURIComponent(token)}`);
    return res.data.data;
  },
  submitPublicConnectLink: async (
    token: string,
    data: { name: string; accountId: string; accessToken: string }
  ): Promise<import('../types').ChannelAccount> => {
    const res = await client.post(`/channels/connect/${encodeURIComponent(token)}`, data);
    return res.data.data;
  },
  mergeContact: async (targetId: string, sourceContactId: string): Promise<Contact> => {
    const res = await client.post(`/contacts/${targetId}/merge`, { sourceContactId });
    return res.data.data;
  },

  addContactIdentity: async (
    contactId: string,
    data: { channel: string; externalId: string; handle?: string }
  ): Promise<import('../types').ContactIdentityItem> => {
    const res = await client.post(`/contacts/${contactId}/identities`, data);
    return res.data.data;
  },

  deleteContactIdentity: async (contactId: string, identityId: string): Promise<void> => {
    await client.delete(`/contacts/${contactId}/identities/${identityId}`);
  },

  getWebhookDeliveries: async (): Promise<import('../types').WebhookDeliveryItem[]> => {
    const res = await client.get('/settings/webhook-deliveries');
    return res.data.data || [];
  },

  testAlertWebhook: async (): Promise<{ delivered: boolean; httpStatus?: number; error?: string }> => {
    const res = await client.post('/settings/webhook-deliveries/test');
    return res.data.data;
  },

  getScheduledPosts: async (params?: {
    channel?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<import('../types').ScheduledPostItem[]> => {
    const res = await client.get('/posts', { params: { limit: 500, ...params } });
    return res.data.data || [];
  },

  getScheduledPostsPaged: async (params?: {
    channel?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: import('../types').ScheduledPostItem[]; pagination: PaginationMeta }> => {
    const res = await client.get('/posts', { params });
    return {
      data: res.data.data || [],
      pagination: res.data.pagination || {
        page: params?.page || 1,
        limit: params?.limit || 25,
        total: (res.data.data || []).length,
        totalPages: 1,
      },
    };
  },

  createScheduledPost: async (data: {
    channel: import('../types').ScheduledPostChannel;
    channelAccountId?: string | null;
    wahaSession?: string | null;
    postType?: import('../types').ScheduledPostType;
    caption: string;
    mediaUrl?: string | null;
    targetChatId?: string | null;
    targetContactIds?: string[];
    targetContacts?: Array<{ contactId?: string | null; phone?: string; name?: string | null }>;
    statusStyle?: import('../types').WhatsAppStatusStyle | null;
    scheduledAt?: string | null;
    publishNow?: boolean;
  }): Promise<import('../types').ScheduledPostItem> => {
    const res = await client.post('/posts', data);
    return res.data.data;
  },

  getScheduledPostViewers: async (
    id: string,
    sync = true
  ): Promise<import('../types').ScheduledPostViewersResponse> => {
    const res = await client.get(`/posts/${id}/viewers`, {
      params: { sync: sync ? 'true' : 'false' },
    });
    return res.data.data;
  },

  deleteRemoteWhatsAppStatus: async (
    id: string
  ): Promise<import('../types').ScheduledPostItem> => {
    const res = await client.post(`/posts/${id}/delete-remote`);
    return res.data.data;
  },

  publishScheduledPostNow: async (id: string): Promise<import('../types').ScheduledPostItem> => {
    const res = await client.post(`/posts/${id}/publish-now`);
    return res.data.data;
  },

  cancelScheduledPost: async (id: string): Promise<void> => {
    await client.post(`/posts/${id}/cancel`);
  },

  deleteScheduledPost: async (id: string): Promise<void> => {
    await client.delete(`/posts/${id}`);
  },

  uploadMedia: async (data: {
    fileName: string;
    mimeType: string;
    base64: string;
    channel?: string;
    sessionName?: string;
    label?: string;
    source?: 'INBOUND' | 'OUTBOUND' | 'UPLOAD' | 'BROADCAST';
  }): Promise<{ filename: string; relativeUrl: string; url: string }> => {
    const res = await client.post('/media/upload', data);
    return res.data.data;
  },

  getMediaLibrary: async (): Promise<import('../types').MediaLibraryItem[]> => {
    const res = await client.get('/media');
    return res.data.data || [];
  },

  deleteMediaFile: async (filename: string): Promise<void> => {
    await client.delete(`/media/files/${encodeURIComponent(filename)}`);
  },

  getContentIdeas: async (): Promise<import('../types').ContentIdeaItem[]> => {
    const res = await client.get('/ideas');
    return res.data.data || [];
  },

  createContentIdea: async (data: {
    title: string;
    notes?: string | null;
    channel?: string;
    stage?: string;
  }): Promise<import('../types').ContentIdeaItem> => {
    const res = await client.post('/ideas', data);
    return res.data.data;
  },

  updateContentIdea: async (
    id: string,
    data: Partial<{ title: string; notes: string | null; channel: string; stage: string }>
  ): Promise<import('../types').ContentIdeaItem> => {
    const res = await client.patch(`/ideas/${id}`, data);
    return res.data.data;
  },

  deleteContentIdea: async (id: string): Promise<void> => {
    await client.delete(`/ideas/${id}`);
  },

  importScheduledPosts: async (
    items: Array<{
      channel: string;
      channelAccountId?: string | null;
      wahaSession?: string | null;
      postType?: string | null;
      caption: string;
      mediaUrl?: string | null;
      targetChatId?: string | null;
      scheduledAt?: string | null;
    }>
  ): Promise<{ imported: number; failed: Array<{ row: number; error: string }> }> => {
    const res = await client.post('/posts/import', { items });
    return res.data.data;
  },

  getIdeaColumns: async (): Promise<import('../types').IdeaColumn[]> => {
    const res = await client.get('/ideas/columns');
    return res.data.data || [];
  },

  saveIdeaColumns: async (
    columns: import('../types').IdeaColumn[]
  ): Promise<import('../types').IdeaColumn[]> => {
    const res = await client.put('/ideas/columns', { columns });
    return res.data.data || [];
  },

  getSocialComments: async (params?: {
    status?: string;
    channel?: string;
  }): Promise<import('../types').SocialCommentItem[]> => {
    const res = await client.get('/comments', { params });
    return res.data.data || [];
  },

  syncSocialComments: async (): Promise<{
    synced: number;
    errors?: string[];
    message?: string;
  }> => {
    const res = await client.post('/comments/sync');
    return res.data.data;
  },

  replySocialComment: async (
    id: string,
    replyText: string
  ): Promise<import('../types').SocialCommentItem> => {
    const res = await client.post(`/comments/${id}/reply`, { replyText });
    return res.data.data;
  },

  updateSocialCommentStatus: async (
    id: string,
    status: 'PENDING' | 'DONE'
  ): Promise<import('../types').SocialCommentItem> => {
    const res = await client.patch(`/comments/${id}/status`, { status });
    return res.data.data;
  },

  deleteSocialComment: async (id: string): Promise<void> => {
    await client.delete(`/comments/${id}`);
  },

  searchSocialFeed: async (
    q: string
  ): Promise<{
    connected: boolean;
    accountName?: string;
    items: import('../types').FeedPostItem[];
    message?: string;
  }> => {
    const res = await client.get('/feed/search', { params: { q } });
    return res.data.data;
  },

  replySocialFeed: async (postId: string, text: string): Promise<{ id: string }> => {
    const res = await client.post('/feed/reply', { postId, text });
    return res.data.data;
  },

  getCommentAutomations: async (): Promise<import('../types').CommentAutomationItem[]> => {
    const res = await client.get('/automations');
    return res.data.data || [];
  },

  createCommentAutomation: async (data: {
    name: string;
    channel: string;
    keyword: string;
    matchType: 'CONTAINS' | 'EXACT';
    replyComment?: string | null;
    sendDm?: boolean;
    dmText?: string | null;
    isActive?: boolean;
  }): Promise<import('../types').CommentAutomationItem> => {
    const res = await client.post('/automations', data);
    return res.data.data;
  },

  updateCommentAutomation: async (
    id: string,
    data: Partial<{
      name: string;
      channel: string;
      keyword: string;
      matchType: 'CONTAINS' | 'EXACT';
      replyComment: string | null;
      sendDm: boolean;
      dmText: string | null;
      isActive: boolean;
    }>
  ): Promise<import('../types').CommentAutomationItem> => {
    const res = await client.patch(`/automations/${id}`, data);
    return res.data.data;
  },

  deleteCommentAutomation: async (id: string): Promise<void> => {
    await client.delete(`/automations/${id}`);
  },

  getAiProviders: async (): Promise<import('../types').AiProviderCatalogEntry[]> => {
    const res = await client.get('/ai-agent/providers');
    return res.data.data || [];
  },

  getAiAgentConfig: async (): Promise<import('../types').AiAgentConfig> => {
    const res = await client.get('/ai-agent/config');
    return res.data.data;
  },

  saveAiAgentConfig: async (
    data: Partial<import('../types').AiAgentConfig>
  ): Promise<import('../types').AiAgentConfig> => {
    const res = await client.put('/ai-agent/config', data);
    return res.data.data;
  },

  fetchAiProviderModels: async (data: {
    slotId?: string;
    provider: import('../types').AiProviderId;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
    extraCandidates?: Array<{
      provider: import('../types').AiProviderId;
      baseUrl?: string;
      apiKey?: string;
    }>;
  }): Promise<{ models: import('../types').AiModelOption[]; source: 'api' | 'recommended' }> => {
    const res = await client.post('/ai-agent/models', data);
    return res.data.data;
  },

  verifyAiProviderSlot: async (data: {
    slotId?: string;
    provider: import('../types').AiProviderId;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
    timeoutMs?: number;
    extraCandidates?: Array<{
      provider: import('../types').AiProviderId;
      baseUrl?: string;
      apiKey?: string;
    }>;
  }): Promise<import('../types').AiSlotVerifyResult> => {
    const res = await client.post('/ai-agent/verify-slot', data);
    return res.data.data;
  },

  getAiKnowledgeBooksCatalog: async (): Promise<import('../types').AiKnowledgeBookPreset[]> => {
    const res = await client.get('/ai-agent/knowledge-books/catalog');
    return res.data.data || [];
  },

  getAiKnowledgeBooks: async (): Promise<import('../types').AiKnowledgeBook[]> => {
    const res = await client.get('/ai-agent/knowledge-books');
    return res.data.data || [];
  },

  createAiKnowledgeBook: async (data: {
    title: string;
    description?: string | null;
    category?: string;
  }): Promise<import('../types').AiKnowledgeBook> => {
    const res = await client.post('/ai-agent/knowledge-books', data);
    return res.data.data;
  },

  installAiKnowledgeBookPreset: async (
    presetId: string
  ): Promise<import('../types').AiKnowledgeBook> => {
    const res = await client.post('/ai-agent/knowledge-books/install-preset', { presetId });
    return res.data.data;
  },

  installAiKnowledgeBookUrl: async (data: {
    url: string;
    title?: string;
    category?: string;
  }): Promise<import('../types').AiKnowledgeBook> => {
    const res = await client.post('/ai-agent/knowledge-books/install-url', data);
    return res.data.data;
  },

  installAiKnowledgeBookMarkdown: async (data: {
    title: string;
    description?: string;
    category?: string;
    rawText: string;
  }): Promise<import('../types').AiKnowledgeBook> => {
    const res = await client.post('/ai-agent/knowledge-books/install-markdown', data);
    return res.data.data;
  },

  installAiKnowledgeBookCatalog: async (): Promise<import('../types').AiKnowledgeBook> => {
    const res = await client.post('/ai-agent/knowledge-books/install-catalog');
    return res.data.data;
  },

  updateAiKnowledgeBook: async (
    id: string,
    data: Partial<{ title: string; description: string | null; category: string; isActive: boolean }>
  ): Promise<import('../types').AiKnowledgeBook> => {
    const res = await client.patch(`/ai-agent/knowledge-books/${id}`, data);
    return res.data.data;
  },

  deleteAiKnowledgeBook: async (id: string): Promise<void> => {
    await client.delete(`/ai-agent/knowledge-books/${id}`);
  },

  getAiKnowledge: async (bookId?: string): Promise<import('../types').AiKnowledgeItem[]> => {
    const res = await client.get('/ai-agent/knowledge', {
      params: bookId ? { bookId } : undefined,
    });
    return res.data.data || [];
  },

  createAiKnowledge: async (data: {
    bookId?: string | null;
    title: string;
    category: string;
    content: string;
    sourceUrl?: string | null;
  }): Promise<import('../types').AiKnowledgeItem> => {
    const res = await client.post('/ai-agent/knowledge', data);
    return res.data.data;
  },

  updateAiKnowledge: async (
    id: string,
    data: Partial<{
      bookId: string | null;
      title: string;
      category: string;
      content: string;
      sourceUrl: string | null;
      isActive: boolean;
    }>
  ): Promise<import('../types').AiKnowledgeItem> => {
    const res = await client.patch(`/ai-agent/knowledge/${id}`, data);
    return res.data.data;
  },

  deleteAiKnowledge: async (id: string): Promise<void> => {
    await client.delete(`/ai-agent/knowledge/${id}`);
  },

  getAiSkillsCatalog: async (): Promise<import('../types').AiSkillPreset[]> => {
    const res = await client.get('/ai-agent/skills/catalog');
    return res.data.data || [];
  },

  getAiSkills: async (): Promise<import('../types').AiSkill[]> => {
    const res = await client.get('/ai-agent/skills');
    return res.data.data || [];
  },

  createAiSkill: async (data: {
    name: string;
    description?: string | null;
    category?: string;
    triggerHint?: string | null;
    instructions: string;
    linkedTools?: string[];
  }): Promise<import('../types').AiSkill> => {
    const res = await client.post('/ai-agent/skills', data);
    return res.data.data;
  },

  installAiSkillPreset: async (slug: string): Promise<import('../types').AiSkill> => {
    const res = await client.post('/ai-agent/skills/install-preset', { slug });
    return res.data.data;
  },

  installAiSkillMarkdown: async (data: {
    rawMarkdown?: string;
    sourceUrl?: string;
    name?: string;
    linkedTools?: string[];
  }): Promise<import('../types').AiSkill> => {
    const res = await client.post('/ai-agent/skills/install-markdown', data);
    return res.data.data;
  },

  updateAiSkill: async (
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      category: string;
      triggerHint: string | null;
      instructions: string;
      linkedTools: string[];
      isActive: boolean;
    }>
  ): Promise<import('../types').AiSkill> => {
    const res = await client.patch(`/ai-agent/skills/${id}`, data);
    return res.data.data;
  },

  deleteAiSkill: async (id: string): Promise<void> => {
    await client.delete(`/ai-agent/skills/${id}`);
  },

  getAiMcpServers: async (): Promise<{
    builtinTools: import('../types').BuiltinCrmTool[];
    servers: import('../types').AiMcpServer[];
  }> => {
    const res = await client.get('/ai-agent/mcp-servers');
    return res.data.data;
  },

  testAiMcpConnection: async (data: {
    name?: string;
    endpointUrl: string;
    authType: 'NONE' | 'BEARER' | 'HEADER';
    authHeaderName?: string;
    authToken?: string;
  }): Promise<{ ok: boolean; toolsCount: number; tools: import('../types').McpToolDescriptor[] }> => {
    const res = await client.post('/ai-agent/mcp-servers/test-connection', data);
    return res.data.data;
  },

  createAiMcpServer: async (data: {
    name: string;
    description?: string | null;
    endpointUrl: string;
    authType: 'NONE' | 'BEARER' | 'HEADER';
    authHeaderName?: string;
    authToken?: string;
  }): Promise<{ server: import('../types').AiMcpServer; warning?: string }> => {
    const res = await client.post('/ai-agent/mcp-servers', data);
    return { server: res.data.data, warning: res.data.warning };
  },

  updateAiMcpServer: async (
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      endpointUrl: string;
      authType: 'NONE' | 'BEARER' | 'HEADER';
      authHeaderName: string;
      authToken: string;
      clearAuthToken: boolean;
      disabledTools: string[];
      isActive: boolean;
    }>
  ): Promise<import('../types').AiMcpServer> => {
    const res = await client.patch(`/ai-agent/mcp-servers/${id}`, data);
    return res.data.data;
  },

  discoverAiMcpServer: async (id: string): Promise<import('../types').AiMcpServer> => {
    const res = await client.post(`/ai-agent/mcp-servers/${id}/discover`);
    return res.data.data;
  },

  deleteAiMcpServer: async (id: string): Promise<void> => {
    await client.delete(`/ai-agent/mcp-servers/${id}`);
  },

  testAiAgent: async (
    message: string,
    draftConfig?: Partial<import('../types').AiAgentConfig>
  ): Promise<import('../types').AiTestResult> => {
    const res = await client.post('/ai-agent/test', { message, draftConfig });
    return res.data.data;
  },

  getOAuthConfig: async (): Promise<{
    reneoOAuthReady: boolean;
    directMetaReady: boolean;
    directThreadsReady: boolean;
  }> => {
    const res = await client.get('/channels/oauth/config');
    return res.data.data;
  },

  // Master Data: Balasan Cepat, Label & Kategori, Template Siaran
  getMasterQuickReplies: async (params?: {
    activeOnly?: boolean;
    category?: string;
    search?: string;
  }): Promise<CannedResponse[]> => {
    const res = await client.get('/master/quick-replies', {
      params: {
        activeOnly: params?.activeOnly ? 'true' : undefined,
        category: params?.category,
        search: params?.search,
      },
    });
    return res.data.data || [];
  },
  createMasterQuickReply: async (data: {
    shortCode: string;
    title: string;
    category?: string;
    content: string;
    isActive?: boolean;
  }): Promise<CannedResponse> => {
    const res = await client.post('/master/quick-replies', data);
    return res.data.data;
  },
  updateMasterQuickReply: async (
    id: string,
    data: Partial<{
      shortCode: string;
      title: string;
      category: string;
      content: string;
      isActive: boolean;
    }>
  ): Promise<CannedResponse> => {
    const res = await client.patch(`/master/quick-replies/${id}`, data);
    return res.data.data;
  },
  deleteMasterQuickReply: async (id: string): Promise<void> => {
    await client.delete(`/master/quick-replies/${id}`);
  },

  getMasterLabels: async (
    scope?: import('../types').CrmLabelScope,
    activeOnly = false
  ): Promise<import('../types').CrmLabelItem[]> => {
    const res = await client.get('/master/labels', {
      params: {
        scope,
        activeOnly: activeOnly ? 'true' : undefined,
      },
    });
    return res.data.data || [];
  },
  createMasterLabel: async (data: {
    scope: import('../types').CrmLabelScope;
    name: string;
    color?: import('../types').CrmLabelColor;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<import('../types').CrmLabelItem> => {
    const res = await client.post('/master/labels', data);
    return res.data.data;
  },
  updateMasterLabel: async (
    id: string,
    data: Partial<{
      name: string;
      color: import('../types').CrmLabelColor;
      description: string | null;
      sortOrder: number;
      isActive: boolean;
    }>
  ): Promise<import('../types').CrmLabelItem> => {
    const res = await client.patch(`/master/labels/${id}`, data);
    return res.data.data;
  },
  deleteMasterLabel: async (id: string): Promise<void> => {
    await client.delete(`/master/labels/${id}`);
  },

  getMessageTemplates: async (params?: {
    activeOnly?: boolean;
    channel?: string;
    category?: string;
  }): Promise<import('../types').MessageTemplateItem[]> => {
    const res = await client.get('/master/templates', {
      params: {
        activeOnly: params?.activeOnly ? 'true' : undefined,
        channel: params?.channel,
        category: params?.category,
      },
    });
    return res.data.data || [];
  },
  createMessageTemplate: async (data: {
    name: string;
    category?: string;
    channel?: string;
    content: string;
    isActive?: boolean;
  }): Promise<import('../types').MessageTemplateItem> => {
    const res = await client.post('/master/templates', data);
    return res.data.data;
  },
  updateMessageTemplate: async (
    id: string,
    data: Partial<{
      name: string;
      category: string;
      channel: string;
      content: string;
      isActive: boolean;
    }>
  ): Promise<import('../types').MessageTemplateItem> => {
    const res = await client.patch(`/master/templates/${id}`, data);
    return res.data.data;
  },
  deleteMessageTemplate: async (id: string): Promise<void> => {
    await client.delete(`/master/templates/${id}`);
  },

  resolveMessageMedia: async (
    conversationId: string,
    messageId: string
  ): Promise<{ mediaUrl: string; mediaType?: string | null; mediaName?: string | null }> => {
    const res = await client.post(
      `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/resolve-media`
    );
    return res.data.data;
  },

  updateMyAvailability: async (
    availabilityStatus: import('../types').AgentAvailabilityStatus
  ): Promise<{
    availabilityStatus: import('../types').AgentAvailabilityStatus;
    user: NonNullable<import('../types').AuthStatus['user']>;
  }> => {
    const res = await client.patch('/auth/availability', { availabilityStatus });
    return res.data.data;
  },

  getMyWorkspaces: async (): Promise<{
    currentCompanyId: string;
    workspaces: import('../types').TenantWorkspaceItem[];
  }> => {
    const res = await client.get('/tenants/my-workspaces');
    return res.data.data;
  },

  createMyWorkspace: async (data: {
    name: string;
    ownerPhone?: string;
  }): Promise<{
    user: NonNullable<import('../types').AuthStatus['user']>;
    company: any;
    license: import('../types').LicenseInfo;
  }> => {
    const res = await client.post('/tenants/my-workspaces', data);
    return res.data.data;
  },

  switchWorkspace: async (
    companyId: string
  ): Promise<{
    user: NonNullable<import('../types').AuthStatus['user']>;
    company: any;
    license?: import('../types').LicenseInfo;
  }> => {
    const res = await client.post('/tenants/switch', { companyId });
    return res.data.data;
  },
};

export default api;

