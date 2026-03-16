import api from './axios';

export const reportsApi = {
  agentPerformance: (params?: Record<string, unknown>) =>
    api.get('/reports/agents/', { params }),

  callSummary: () =>
    api.get('/reports/calls/summary/'),

  leadPipeline: () =>
    api.get('/reports/leads/pipeline/'),

  followupRate: () =>
    api.get('/reports/followups/rate/'),

  campaignStats: (campaign_id?: string) =>
    api.get('/reports/campaigns/stats/', { params: { campaign_id } }),
};
