const LOCAL_IP = '10.198.237.237';

const DEV_URL = `http://${LOCAL_IP}:3001`;
const PROD_URL = 'https://your-app.railway.app';

export const API_BASE = __DEV__ ? DEV_URL : PROD_URL;

export const ENDPOINTS = {
  scenarios: `${API_BASE}/api/scenarios`,
  scenario: (id: string) => `${API_BASE}/api/scenarios/${id}`,
  cascade: (hazardId: string) => `${API_BASE}/api/cascade/${hazardId}`,
  health: `${API_BASE}/health`,
};