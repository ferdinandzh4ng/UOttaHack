/**
 * Feedback Normalizer Service
 * Converts raw biometric metrics into semantic feedback signals
 * This is the "meaning layer" between raw metrics and decision-making
 */
class FeedbackNormalizerService {
  /**
   * Normalize raw metrics into feedback signals
   * @param {Object} rawMetrics - Raw metrics from vitals service
   * @param {Object} sessionContext - Session context (task type, topic, etc.)
   * @returns {Object} Normalized feedback signals
   */
  normalize(rawMetrics, sessionContext = {}) {
    const {
      averageHeartRate,
      averageBreathingRate,
      averageFocusScore,
      averageEngagementScore,
      averageThinkingIntensity,
      heartRateStdDev,
      breathingRateStdDev
    } = rawMetrics;

    // Calculate semantic feedback signals
    const feedback = {
      // Clarity: How clear was the content? (based on focus + thinking)
      clarityScore: this.calculateClarityScore(
        averageFocusScore,
        averageThinkingIntensity,
        breathingRateStdDev
      ),
      
      // Engagement: How engaged was the student? (based on engagement score + vitals)
      engagementScore: this.calculateEngagementScore(
        averageEngagementScore,
        averageHeartRate,
        heartRateStdDev
      ),
      
      // Fatigue trend: Is the student getting tired? (based on breathing + heart rate trends)
      fatigueTrend: this.calculateFatigueTrend(
        averageBreathingRate,
        averageHeartRate,
        breathingRateStdDev,
        heartRateStdDev
      ),
      
      // Cognitive load: How much mental effort? (based on thinking intensity + stability)
      cognitiveLoad: this.calculateCognitiveLoad(
        averageThinkingIntensity,
        heartRateStdDev,
        breathingRateStdDev
      ),
      
      // Attention span: How well did they maintain attention? (based on focus stability)
      attentionSpan: this.calculateAttentionSpan(
        averageFocusScore,
        heartRateStdDev,
        breathingRateStdDev
      ),
      
      // Confidence: How confident do they seem? (derived from multiple signals)
      confidence: this.calculateConfidence(
        averageFocusScore,
        averageEngagementScore,
        averageThinkingIntensity
      ),
      
      // Metadata
      timestamp: new Date(),
      sessionContext
    };

    return feedback;
  }

  /**
   * Calculate clarity score (0-1, higher = clearer)
   */
  calculateClarityScore(focusScore, thinkingIntensity, breathingStdDev) {
    if (!focusScore && !thinkingIntensity) return 0.5; // Default neutral
    
    // High focus + moderate thinking = high clarity
    // Very high thinking might indicate confusion
    const focusComponent = (focusScore || 0) / 100;
    const thinkingComponent = Math.min(1, (thinkingIntensity || 0) / 80); // Cap at 80 for clarity
    const stabilityComponent = breathingStdDev ? Math.max(0, 1 - (breathingStdDev / 5)) : 0.5;
    
    // Weighted combination
    return Math.min(1, Math.max(0,
      (focusComponent * 0.4) +
      (thinkingComponent * 0.4) +
      (stabilityComponent * 0.2)
    ));
  }

  /**
   * Calculate engagement score (0-1, higher = more engaged)
   */
  calculateEngagementScore(engagementScore, heartRate, heartRateStdDev) {
    if (!engagementScore) return 0.5;
    
    const engagementComponent = (engagementScore || 0) / 100;
    
    // Heart rate in optimal range (70-90) indicates engagement
    let heartRateComponent = 0.5; // Default neutral
    if (heartRate) {
      if (heartRate >= 70 && heartRate <= 90) {
        heartRateComponent = 1.0;
      } else if (heartRate >= 60 && heartRate < 70) {
        heartRateComponent = 0.8;
      } else if (heartRate > 90 && heartRate <= 100) {
        heartRateComponent = 0.8;
      } else {
        heartRateComponent = 0.5;
      }
    }
    
    // Low variability = sustained engagement
    const stabilityComponent = heartRateStdDev 
      ? Math.max(0, 1 - (heartRateStdDev / 10))
      : 0.5;
    
    return Math.min(1, Math.max(0,
      (engagementComponent * 0.6) +
      (heartRateComponent * 0.2) +
      (stabilityComponent * 0.2)
    ));
  }

  /**
   * Calculate fatigue trend ('rising', 'stable', 'falling')
   */
  calculateFatigueTrend(breathingRate, heartRate, breathingStdDev, heartRateStdDev) {
    // Rising fatigue indicators:
    // - Increasing breathing rate
    // - Increasing heart rate variability
    // - Decreasing breathing stability
    
    let fatigueScore = 0.5; // Neutral
    
    // Breathing rate analysis (higher = more fatigue)
    if (breathingRate) {
      if (breathingRate > 20) fatigueScore += 0.2;
      else if (breathingRate > 18) fatigueScore += 0.1;
      else if (breathingRate < 12) fatigueScore -= 0.1; // Slow breathing = less fatigue
    }
    
    // Variability analysis (higher variability = more fatigue)
    if (breathingStdDev) {
      if (breathingStdDev > 3) fatigueScore += 0.2;
      else if (breathingStdDev > 2) fatigueScore += 0.1;
    }
    
    if (heartRateStdDev) {
      if (heartRateStdDev > 8) fatigueScore += 0.1;
    }
    
    // Categorize
    if (fatigueScore > 0.7) return 'rising';
    if (fatigueScore < 0.3) return 'falling';
    return 'stable';
  }

  /**
   * Calculate cognitive load (0-1, higher = higher load)
   */
  calculateCognitiveLoad(thinkingIntensity, heartRateStdDev, breathingStdDev) {
    if (!thinkingIntensity) return 0.5;
    
    const thinkingComponent = (thinkingIntensity || 0) / 100;
    
    // High variability can indicate high cognitive load
    const variabilityComponent = 
      ((heartRateStdDev || 0) / 10) * 0.5 +
      ((breathingStdDev || 0) / 5) * 0.5;
    
    return Math.min(1, Math.max(0,
      (thinkingComponent * 0.7) +
      (variabilityComponent * 0.3)
    ));
  }

  /**
   * Calculate attention span (0-1, higher = better attention)
   */
  calculateAttentionSpan(focusScore, heartRateStdDev, breathingStdDev) {
    if (!focusScore) return 0.5;
    
    const focusComponent = (focusScore || 0) / 100;
    
    // Low variability = sustained attention
    const stabilityComponent = 
      (heartRateStdDev ? Math.max(0, 1 - (heartRateStdDev / 10)) : 0.5) * 0.5 +
      (breathingStdDev ? Math.max(0, 1 - (breathingStdDev / 5)) : 0.5) * 0.5;
    
    return Math.min(1, Math.max(0,
      (focusComponent * 0.6) +
      (stabilityComponent * 0.4)
    ));
  }

  /**
   * Calculate confidence (0-1, higher = more confident)
   */
  calculateConfidence(focusScore, engagementScore, thinkingIntensity) {
    // Confidence is high when:
    // - High focus (they're paying attention)
    // - Moderate-high engagement (they're interested)
    // - Moderate thinking (not too confused, not too bored)
    
    const focusComponent = (focusScore || 0) / 100;
    const engagementComponent = (engagementScore || 0) / 100;
    
    // Optimal thinking intensity is moderate (40-70)
    let thinkingComponent = 0.5;
    if (thinkingIntensity) {
      if (thinkingIntensity >= 40 && thinkingIntensity <= 70) {
        thinkingComponent = 1.0;
      } else if (thinkingIntensity >= 30 && thinkingIntensity < 40) {
        thinkingComponent = 0.8;
      } else if (thinkingIntensity > 70 && thinkingIntensity <= 80) {
        thinkingComponent = 0.8;
      } else {
        thinkingComponent = 0.5;
      }
    }
    
    return Math.min(1, Math.max(0,
      (focusComponent * 0.4) +
      (engagementComponent * 0.4) +
      (thinkingComponent * 0.2)
    ));
  }

  /**
   * Calculate fatigue slope (rate of change in fatigue)
   * Requires time-series data
   */
  calculateFatigueSlope(metricsHistory) {
    if (!metricsHistory || metricsHistory.length < 2) return 0;
    
    // Simple linear regression on fatigue indicators
    const fatigueIndicators = metricsHistory.map((m, idx) => {
      const breathingRate = m.breathingRate || 0;
      const breathingStdDev = 0; // Would need to calculate from window
      return breathingRate + (breathingStdDev * 2);
    });
    
    // Calculate slope
    const n = fatigueIndicators.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = fatigueIndicators.reduce((a, b) => a + b, 0);
    const sumXY = fatigueIndicators.reduce((sum, val, idx) => sum + (idx * val), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return slope; // Positive = rising fatigue, negative = falling
  }
}

export default new FeedbackNormalizerService();

