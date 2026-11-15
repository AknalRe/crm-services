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
    sessionName?: string;
  }): Promise<any> => {
    const res = await client.post('/broadcasts', data);
    return res.data;
  },
  cancelCampaign: async (id: string): Promise<any> => {
    const res = await client.post(`/broadcasts/${id}/cancel`);
    return res.data;
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
  getCannedResponses: async (): Promise<CannedResponse[]> => {
    const res = await client.get('/conversations/canned');
    return res.data.data;
  },
  createCannedResponse: async (data: {
    shortCode: string;
    title: string;
    content: string;
  }): Promise<CannedResponse> => {
    const res = await client.post('/conversations/canned', data);
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

  getWebhookDeliveries: async (): Promise<import('../types').WebhookDeliveryItem[]> => {
    const res = await client.get('/settings/webhook-deliveries');
    return res.data.data || [];
  },

  testAlertWebhook: async (): Promise<{ delivered: boolean; httpStatus?: number; error?: string }> => {
    const res = await client.post('/settings/webhook-deliveries/test');
    return res.data.data;
  },
};

export default api;

