import axios from 'axios';
import { ENDPOINTS } from '../constants/api';

const CHECK_TIMEOUT_MS = 5000;

/**
 * Performs a health check against the API backend.
 * In development mode, warns via console if the API is unreachable.
 */
export async function checkApiHealth(): Promise<void> {
  if (!__DEV__) return;

  try {
    const response = await axios.get(ENDPOINTS.health, {
      timeout: CHECK_TIMEOUT_MS,
    });
    if (response.status >= 200 && response.status < 300) {
      console.log('[health] API is reachable ✓');
    } else {
      console.warn(
        `[health] API returned unexpected status: ${response.status}`,
      );
    }
  } catch (error: any) {
    console.warn(
      `[health] ⚠️  API is unreachable — check that the backend is running at ${ENDPOINTS.health}`,
    );
    if (error.message) {
      console.warn(`[health]  └─ ${error.message}`);
    }
  }
}