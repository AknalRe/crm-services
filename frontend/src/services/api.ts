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
  BirthdaySetting,
  LicenseInfo,
  AuthStatus,
  LicensePlan,
  LicenseOrder,
  PaymentMethodItem,
  AgentItem,
  AgentQuota,
  CrmSlaCsatSettings,
  CannedResponse,
} from '../types';

const client = axios.create({
  baseURL: './api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Dashboard
  getDashboardStats: async (): Promise<DashboardStats> => {
    const res = await client.get('/dashboard/stats');
    return res.data.data;
  },

  // Contacts
  getContacts: async (params?: { search?: string; tag?: string; kategori?: string; page?: number; limit?: number }) => {
    const res = await client.get('/contacts', { params });
    return res.data;
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

  // Campaigns & Broadcasts
  getCampaigns: async (params?: { status?: string; type?: string }): Promise<Campaign[]> => {
    const res = await client.get('/broadcasts', { params });
    return res.data.data;
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
  getRecipientTracking: async (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const res = await client.get('/broadcasts/tracking/recipients', { params });
    return res.data;
  },

  // Conversations (CRM Live Chat)
  getConversations: async (): Promise<Conversation[]> => {
    const res = await client.get('/conversations');
    return res.data.data;
  },
  getConversationMessages: async (id: string): Promise<ChatMessage[]> => {
    const res = await client.get(`/conversations/${id}/messages`);
    return res.data.data;
  },
  sendConversationMessage: async (
    id: string,
    payload: {
      body?: string;
      session?: string;
      mediaBase64?: string;
      mediaMimetype?: string;
      mediaName?: string;
    }
  ): Promise<ChatMessage> => {
    const res = await client.post(`/conversations/${id}/messages`, payload);
    return res.data.data;
  },
  updateConversation: async (
    id: string,
    payload: {
      status?: 'OPEN' | 'PENDING' | 'RESOLVED';
      labels?: string | null;
      wahaSession?: string | null;
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
    alreadyRated: boolean;
    rating?: number | null;
    feedback?: string | null;
    submittedAt?: string | null;
  }> => {
    const res = await client.get(`/public/csat/${encodeURIComponent(token)}`);
    return res.data.data;
  },
  submitPublicCsat: async (
    token: string,
    payload: { rating: number; feedback?: string }
  ): Promise<any> => {
    const res = await client.post(`/public/csat/${encodeURIComponent(token)}`, payload);
    return res.data;
  },

  // WAHA & WhatsApp Integration
  getWahaStatus: async (): Promise<WahaStatus> => {
    const res = await client.get('/waha/status');
    return res.data.data;
  },
  getWahaQr: async (session?: string): Promise<{ qr?: string; status: string }> => {
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
  }): Promise<any> => {
    const res = await client.post('/settings/waha', data);
    return res.data;
  },
  sendTestMessage: async (phone: string, message: string): Promise<any> => {
    const res = await client.post('/waha/send-test', { phone, message });
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

  // Multi-Agent Management
  getAgents: async (): Promise<{ agents: AgentItem[]; quota: AgentQuota }> => {
    const res = await client.get('/agents');
    return res.data.data;
  },
  createAgent: async (data: {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'AGENT';
    permissions: string[];
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

  // Open Conversation with any contact
  openConversation: async (contactId: string, session?: string): Promise<Conversation> => {
    const res = await client.post('/conversations/open', { contactId, session });
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
  startLicenseTrial: async (planSlug: string): Promise<LicenseInfo> => {
    const res = await client.post('/license/trial', { planSlug });
    return res.data.data;
  },
  createLicenseOrder: async (data: {
    planSlug: string;
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
  downloadDashboardExport: async (type: 'agents' | 'conversations' | 'broadcasts'): Promise<void> => {
    const res = await client.get('/dashboard/export', {
      params: { type },
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

  getScheduledPosts: async (): Promise<import('../types').ScheduledPostItem[]> => {
    const res = await client.get('/posts');
    return res.data.data || [];
  },

  createScheduledPost: async (data: {
    channel: 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
    channelAccountId: string;
    caption: string;
    mediaUrl?: string | null;
    targetChatId?: string | null;
    scheduledAt?: string | null;
    publishNow?: boolean;
  }): Promise<import('../types').ScheduledPostItem> => {
    const res = await client.post('/posts', data);
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
      channelAccountId?: string;
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

  getAiKnowledge: async (): Promise<import('../types').AiKnowledgeItem[]> => {
    const res = await client.get('/ai-agent/knowledge');
    return res.data.data || [];
  },

  createAiKnowledge: async (data: {
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

  testAiAgent: async (message: string): Promise<{ reply: string; source: string }> => {
    const res = await client.post('/ai-agent/test', { message });
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
};

export default api;

