import * as Sentry from '@sentry/node';

/**
 * Feedback Alert Service
 * Sends alerts to Sentry for critical feedback events
 */
class FeedbackAlertService {
  constructor() {
    this.isInitialized = false;
    this.initializeSentry();
  }

  /**
   * Initialize Sentry if configured
   */
  initializeSentry() {
    const sentryDsn = process.env.SENTRY_DSN;
    
    if (sentryDsn) {
      Sentry.init({
        dsn: sentryDsn,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1
      });
      this.isInitialized = true;
      console.log('✅ [FeedbackAlert] Sentry initialized');
    } else {
      console.warn('⚠️ [FeedbackAlert] Sentry DSN not configured - alerts disabled');
    }
  }

  /**
   * Alert on sudden vitality collapse
   * @param {Object} feedback - Session feedback
   * @param {Object} context - Additional context
   */
  alertVitalityCollapse(feedback, context = {}) {
    if (!this.isInitialized) return;

    const { clarityScore, engagementScore, fatigueTrend } = feedback;
    
    // Check for collapse indicators
    const isCollapse = 
      clarityScore < 0.3 ||
      engagementScore < 0.3 ||
      (fatigueTrend === 'rising' && clarityScore < 0.4);

    if (isCollapse) {
      Sentry.captureMessage('AI Teaching Vitality Collapse', {
        level: 'warning',
        tags: {
          agentCombo: context.agentCombo || 'unknown',
          topic: context.topic || 'unknown',
          taskType: context.taskType || 'unknown'
        },
        extra: {
          clarityScore,
          engagementScore,
          fatigueTrend,
          sessionId: context.sessionId,
          timestamp: new Date().toISOString()
        }
      });

      console.warn(`🚨 [FeedbackAlert] Vitality collapse detected for ${context.agentCombo || 'unknown'}`);
    }
  }

  /**
   * Alert on repeated low clarity scores
   * @param {Object} feedbackPattern - Aggregated feedback pattern
   * @param {Object} context - Additional context
   */
  alertLowClarity(feedbackPattern, context = {}) {
    if (!this.isInitialized) return;

    if (feedbackPattern.avgClarity < 0.4 && feedbackPattern.sessionCount >= 3) {
      Sentry.captureMessage('AI Teaching Low Clarity Pattern', {
        level: 'warning',
        tags: {
          agentCombo: context.agentCombo || 'unknown',
          topic: context.topic || 'unknown',
          taskType: context.taskType || 'unknown'
        },
        extra: {
          avgClarity: feedbackPattern.avgClarity,
          sessionCount: feedbackPattern.sessionCount,
          timestamp: new Date().toISOString()
        }
      });

      console.warn(`🚨 [FeedbackAlert] Low clarity pattern detected for ${context.agentCombo || 'unknown'}`);
    }
  }

  /**
   * Alert on agent combo regression
   * @param {Object} performanceProfile - Agent performance profile
   * @param {Object} previousPerformance - Previous performance (if available)
   */
  alertAgentRegression(performanceProfile, previousPerformance = null) {
    if (!this.isInitialized) return;

    if (previousPerformance) {
      const regression = 
        performanceProfile.performanceScore < previousPerformance.performanceScore * 0.8;

      if (regression && performanceProfile.sessionCount >= 5) {
        Sentry.captureMessage('AI Agent Combo Performance Regression', {
          level: 'warning',
          tags: {
            agentCombo: performanceProfile.agentCombo,
            topic: performanceProfile.topic,
            taskType: performanceProfile.taskType
          },
          extra: {
            currentScore: performanceProfile.performanceScore,
            previousScore: previousPerformance.performanceScore,
            decline: ((previousPerformance.performanceScore - performanceProfile.performanceScore) / previousPerformance.performanceScore * 100).toFixed(1) + '%',
            sessionCount: performanceProfile.sessionCount,
            timestamp: new Date().toISOString()
          }
        });

        console.warn(`🚨 [FeedbackAlert] Performance regression for ${performanceProfile.agentCombo}`);
      }
    }
  }

  /**
   * Alert on critical feedback threshold breach
   * @param {Object} feedback - Session feedback
   * @param {Object} context - Additional context
   */
  alertCriticalThreshold(feedback, context = {}) {
    if (!this.isInitialized) return;

    const criticalThresholds = {
      clarity: 0.25,
      engagement: 0.25,
      confidence: 0.2
    };

    const breaches = [];

    if (feedback.clarityScore < criticalThresholds.clarity) {
      breaches.push(`Clarity: ${feedback.clarityScore.toFixed(2)}`);
    }

    if (feedback.engagementScore < criticalThresholds.engagement) {
      breaches.push(`Engagement: ${feedback.engagementScore.toFixed(2)}`);
    }

    if (feedback.confidence < criticalThresholds.confidence) {
      breaches.push(`Confidence: ${feedback.confidence.toFixed(2)}`);
    }

    if (breaches.length > 0) {
      Sentry.captureMessage('Critical Feedback Threshold Breach', {
        level: 'error',
        tags: {
          agentCombo: context.agentCombo || 'unknown',
          topic: context.topic || 'unknown',
          taskType: context.taskType || 'unknown'
        },
        extra: {
          breaches: breaches.join(', '),
          feedback,
          sessionId: context.sessionId,
          timestamp: new Date().toISOString()
        }
      });

      console.error(`🚨 [FeedbackAlert] Critical threshold breach: ${breaches.join(', ')}`);
    }
  }
}

export default new FeedbackAlertService();

