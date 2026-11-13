import axios from 'axios';
import {
  Contact,
  Campaign,
  CampaignRecipient,
  Conversation,
  ChatMessage,
  DashboardStats,
  WahaStatus,
  BirthdaySetting,
  LicenseInfo,
  LicensePlan,
  LicenseOrder,
  PaymentMethodItem,
} from '../types';

const client = axios.create({
  baseURL: '/api',
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
  getContacts: async (params?: { search?: string; tag?: string; page?: number; limit?: number }) => {
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
  sendConversationMessage: async (id: string, body: string): Promise<ChatMessage> => {
    const res = await client.post(`/conversations/${id}/messages`, { body });
    return res.data.data;
  },

  // WAHA & WhatsApp Integration
  getWahaStatus: async (): Promise<WahaStatus> => {
    const res = await client.get('/waha/status');
    return res.data.data;
  },
  getWahaQr: async (): Promise<{ qr?: string; status: string }> => {
    const res = await client.get('/waha/qr');
    return res.data.data;
  },
  startWahaSession: async (): Promise<any> => {
    const res = await client.post('/waha/session/start');
    return res.data.data;
  },
  stopWahaSession: async (): Promise<any> => {
    const res = await client.post('/waha/session/stop');
    return res.data.data;
  },
  logoutWahaSession: async (): Promise<any> => {
    const res = await client.post('/waha/session/logout');
    return res.data.data;
  },
  updateWahaSettings: async (data: { baseUrl: string; apiKey?: string; session?: string }): Promise<any> => {
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

  // License & Reneo Subscription
  getLicenseStatus: async (): Promise<LicenseInfo> => {
    const res = await client.get('/license/status');
    return res.data.data;
  },
  syncLicense: async (): Promise<LicenseInfo> => {
    const res = await client.post('/license/sync');
    return res.data.data;
  },
  getLicensePlans: async (): Promise<LicensePlan[]> => {
    const res = await client.get('/license/plans');
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
};

export default api;

