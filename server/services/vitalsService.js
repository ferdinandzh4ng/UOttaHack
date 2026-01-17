import axios from 'axios';

class VitalsService {
  constructor() {
    // Python vitals service URL (will run on port 5002)
    this.vitalsServiceUrl = process.env.VITALS_SERVICE_URL || 'http://localhost:5002';
    this.isAvailable = false;
  }

  /**
   * Check if the vitals service is available
   */
  async checkAvailability() {
    try {
      const response = await axios.get(`${this.vitalsServiceUrl}/health`, {
        timeout: 2000
      });
      this.isAvailable = response.status === 200;
      return this.isAvailable;
    } catch (error) {
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Start a new vitals collection session
   * @param {string} sessionId - Unique session ID
   * @param {string} apiKey - Presage API key
   * @returns {Promise<Object>} Session info
   */
  async startSession(sessionId, apiKey) {
    try {
      const response = await axios.post(
        `${this.vitalsServiceUrl}/api/vitals/session/start`,
        {
          session_id: sessionId,
          api_key: apiKey
        },
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      console.error('[VitalsService] Error starting session:', error.message);
      throw new Error(`Failed to start vitals session: ${error.message}`);
    }
  }

  /**
   * Send video frame for processing
   * @param {string} sessionId - Session ID
   * @param {Buffer} frameData - Video frame as buffer/base64
   * @param {number} timestamp - Frame timestamp
   * @returns {Promise<Object>} Metrics from the frame
   */
  async processFrame(sessionId, frameData, timestamp) {
    try {
      const response = await axios.post(
        `${this.vitalsServiceUrl}/api/vitals/frame`,
        {
          session_id: sessionId,
          frame: frameData.toString('base64'),
          timestamp: timestamp
        },
        { timeout: 10000 }
      );
      // Python service returns { success: true, metrics: {...} }
      // Extract just the metrics object
      if (response.data && response.data.metrics) {
        return response.data.metrics;
      }
      return response.data;
    } catch (error) {
      console.error('[VitalsService] Error processing frame:', error.message);
      // Don't throw - allow session to continue even if some frames fail
      return null;
    }
  }

  /**
   * Stop a vitals collection session and get final metrics
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Final aggregated metrics or null if service unavailable
   */
  async stopSession(sessionId) {
    try {
      const response = await axios.post(
        `${this.vitalsServiceUrl}/api/vitals/session/stop`,
        {
          session_id: sessionId
        },
        { timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      console.error('[VitalsService] Error stopping session:', error.message);
      // Don't throw - allow session to stop gracefully even if vitals service is unavailable
      // The metrics are already stored in the database, so we can still calculate aggregates
      return null;
    }
  }
}

export default new VitalsService();

