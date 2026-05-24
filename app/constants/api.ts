const PROD_URL = 'https://cascadeiq-production.up.railway.app';

export const API_BASE = PROD_URL;

export const ENDPOINTS = {
  scenarios: `${API_BASE}/api/scenarios`,
  scenario: (id: string) => `${API_BASE}/api/scenarios/${id}`,
  cascade: (hazardId: string) => `${API_BASE}/api/cascade/${hazardId}`,
  health: `${API_BASE}/health`,
};