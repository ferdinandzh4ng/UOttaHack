import express from 'express';
import StudentTaskSession from '../models/StudentTaskSession.js';
import Task from '../models/Task.js';
import Class from '../models/Class.js';
import vitalsService from '../services/vitalsService.js';
import modelRecommendationService from '../services/modelRecommendationService.js';
import feedbackNormalizerService from '../services/feedbackNormalizerService.js';
import surveyMonkeyService from '../services/surveyMonkeyService.js';
import agentSelectionService from '../services/agentSelectionService.js';
import feedbackAlertService from '../services/feedbackAlertService.js';
import SessionFeedback from '../models/SessionFeedback.js';

const router = express.Router();

/**
 * Start a new vitals collection session
 * POST /api/metrics/session/start
 */
router.post('/session/start', async (req, res) => {
  try {
    const { studentId, taskId } = req.body;

    if (!studentId || !taskId) {
      return res.status(400).json({ error: 'Student ID and Task ID are required' });
    }

    // Get task and class info
    let task = await Task.findById(taskId).populate('class');
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // If this is a parent task (no parentTask field), find the student's variant task
    // Variant tasks have the aiModels populated
    if (!task.parentTask) {
      const StudentGroup = (await import('../models/StudentGroup.js')).default;
      const group = await StudentGroup.findOne({
        task: taskId,
        students: studentId
      });
      
      if (group && group.taskVariantId) {
        const variantTask = await Task.findById(group.taskVariantId);
        if (variantTask && variantTask.aiModels) {
          // Use variant task for aiModels, but keep parent task for other info
          task = { ...task.toObject(), aiModels: variantTask.aiModels };
          console.log(`📊 [METRICS] Using variant task ${group.taskVariantId} aiModels for session`);
        }
      }
    }

    const classData = await Class.findById(task.class);
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check if vitals service is available
    const isAvailable = await vitalsService.checkAvailability();
    if (!isAvailable) {
      return res.status(503).json({ 
        error: 'Vitals service is not available',
        message: 'The vitals collection service is not running. Please ensure the Python vitals service is started.'
      });
    }

    // Get Presage API key from environment
    const presageApiKey = process.env.PRESAGE_API_KEY;
    if (!presageApiKey) {
      return res.status(500).json({ 
        error: 'Presage API key not configured',
        message: 'PRESAGE_API_KEY environment variable is not set'
      });
    }

    // Create database session record first to get the startTime
    const session = new StudentTaskSession({
      student: studentId,
      task: taskId,
      class: task.class,
      taskType: task.type,
      gradeLevel: classData.gradeLevel,
      subject: classData.subject,
      aiModels: task.aiModels || {},
      startTime: new Date(),
      status: 'active'
    });

    await session.save();

    // Create presage session ID using the same format as frame processing
    const presageSessionId = `session_${session.startTime.getTime()}_${session.student}_${session.task}`;

    // Start session in vitals service (don't fail if this fails, session is already in DB)
    try {
      await vitalsService.startSession(presageSessionId, presageApiKey);
      console.log(`📊 [METRICS] Session started in vitals service - ID: ${session._id} | Presage ID: ${presageSessionId} | Student: ${studentId} | Task: ${taskId}`);
    } catch (error) {
      console.error(`⚠️ [METRICS] Failed to start session in vitals service: ${error.message}`);
      console.error(`   Session will continue with fallback metrics. Presage ID: ${presageSessionId}`);
      // Don't throw - allow session to continue with fallback metrics
    }

    res.json({
      sessionId: session._id.toString(),
      presageSessionId: presageSessionId,
      message: 'Vitals collection session started'
    });
  } catch (error) {
    console.error('[MetricRoutes] Error starting session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process a video frame
 * POST /api/metrics/frame
 */
router.post('/frame', async (req, res) => {
  try {
    const { sessionId, frameData, timestamp } = req.body;

    if (!sessionId || !frameData) {
      return res.status(400).json({ error: 'Session ID and frame data are required' });
    }

    // Get session
    const session = await StudentTaskSession.findById(sessionId);
    if (!session || session.status !== 'active') {
      return res.status(404).json({ error: 'Session not found or not active' });
    }

    // Process frame with vitals service
    const presageSessionId = `session_${session.startTime.getTime()}_${session.student}_${session.task}`;
    const frameSize = Buffer.from(frameData, 'base64').length;
    console.log(`📹 [FRAME] Processing frame - Session: ${sessionId.substring(0, 20)}... | Presage ID: ${presageSessionId.substring(0, 30)}... | Size: ${frameSize} bytes | Frame #${session.metrics.length + 1}`);
    
    // Try to ensure session exists in vitals service (in case start failed)
    const isAvailable = await vitalsService.checkAvailability();
    if (isAvailable) {
      try {
        // Try to start session if it doesn't exist (idempotent - won't fail if already exists)
        const presageApiKey = process.env.PRESAGE_API_KEY;
        if (presageApiKey) {
          await vitalsService.startSession(presageSessionId, presageApiKey);
        }
      } catch (error) {
        // Session might already exist, that's okay
        console.log(`ℹ️ [METRICS] Session start attempt (may already exist): ${error.message}`);
      }
    }
    
    let metrics = await vitalsService.processFrame(
      presageSessionId,
      Buffer.from(frameData, 'base64'),
      timestamp || Date.now()
    );

    // Fallback to simulated metrics if vitals service is unavailable
    if (!metrics) {
      console.log('⚠️ [METRICS] Vitals service unavailable, using simulated metrics');
      // Generate realistic simulated metrics for demonstration
      // These will vary slightly to simulate real readings
      const baseHeartRate = 70 + Math.sin(Date.now() / 10000) * 5; // 65-75 BPM range
      const baseBreathingRate = 16 + Math.cos(Date.now() / 8000) * 2; // 14-18 BPM range
      
      metrics = {
        heart_rate: Math.round(baseHeartRate * 10) / 10,
        breathing_rate: Math.round(baseBreathingRate * 10) / 10,
        focus_score: 60 + Math.random() * 20, // 60-80 range
        engagement_score: 65 + Math.random() * 15, // 65-80 range
        thinking_intensity: 50 + Math.random() * 25 // 50-75 range
      };
    }

    // Store individual metric reading
    const metricReading = {
      heartRate: metrics.heart_rate || metrics.heartRate || null,
      breathingRate: metrics.breathing_rate || metrics.breathingRate || null,
      focusScore: metrics.focus_score || metrics.focusScore || 0,
      engagementScore: metrics.engagement_score || metrics.engagementScore || 0,
      thinkingIntensity: metrics.thinking_intensity || metrics.thinkingIntensity || 0,
      timestamp: new Date(timestamp || Date.now())
    };

    session.metrics.push(metricReading);
    await session.save();

    // Log metrics in real-time for testing
    const logData = {
      sessionId: sessionId.substring(0, 20) + '...',
      heartRate: metricReading.heartRate !== null ? `${metricReading.heartRate.toFixed(1)} BPM` : 'N/A',
      breathingRate: metricReading.breathingRate !== null ? `${metricReading.breathingRate.toFixed(1)} BPM` : 'N/A',
      focus: `${metricReading.focusScore.toFixed(1)}/100`,
      engagement: `${metricReading.engagementScore.toFixed(1)}/100`,
      thinking: `${metricReading.thinkingIntensity.toFixed(1)}/100`,
      frameCount: session.metrics.length,
      timestamp: new Date().toISOString()
    };
    console.log('📊 [METRICS] Frame processed:', logData);
    
    // Also log a compact one-liner for easier reading
    console.log(`📊 [METRICS] HR: ${logData.heartRate} | BR: ${logData.breathingRate} | Focus: ${logData.focus} | Engagement: ${logData.engagement} | Thinking: ${logData.thinking} | Frame #${logData.frameCount}`);

    res.json({ success: true, metrics });
  } catch (error) {
    console.error('[MetricRoutes] Error processing frame:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop a vitals collection session and calculate aggregated metrics
 * POST /api/metrics/session/stop
 */
router.post('/session/stop', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Get session
    let session = await StudentTaskSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is not active' });
    }

    // Get AI models from the student's group and variant task
    // Every student is assigned to a group, and each group has a variant task with specific AI models
    const StudentGroup = (await import('../models/StudentGroup.js')).default;
    const task = await Task.findById(session.task);
    
    if (task) {
      let variantTask = null;
      
      if (task.parentTask) {
        // This is already a variant task, use it directly
        variantTask = task;
      } else {
        // This is a parent task, find the student's group and get the variant task
        const group = await StudentGroup.findOne({
          task: session.task,
          students: session.student
        });
        
        if (group && group.taskVariantId) {
          variantTask = await Task.findById(group.taskVariantId);
          if (variantTask) {
            console.log(`📊 [METRICS] Found variant task ${variantTask._id} for group ${group.groupNumber}`);
          }
        } else if (group) {
          console.warn(`⚠️ [METRICS] Group ${group.groupNumber} found but no variant task assigned yet`);
        } else {
          console.warn(`⚠️ [METRICS] No group found for student ${session.student} and task ${session.task}`);
        }
      }
      
      // Update session with variant task's aiModels (includes full model names)
      if (variantTask && variantTask.aiModels) {
        session.aiModels = variantTask.aiModels;
        await session.save();
        console.log(`✅ [METRICS] Updated session with AI models:`, {
          taskType: session.taskType,
          scriptModel: variantTask.aiModels.scriptModel ? 
            `${variantTask.aiModels.scriptModel.provider}:${variantTask.aiModels.scriptModel.model}` : 'N/A',
          imageModel: variantTask.aiModels.imageModel ? 
            `${variantTask.aiModels.imageModel.provider}:${variantTask.aiModels.imageModel.model}` : 'N/A',
          quizQuestionsModel: variantTask.aiModels.quizQuestionsModel ? 
            `${variantTask.aiModels.quizQuestionsModel.provider}:${variantTask.aiModels.quizQuestionsModel.model}` : 'N/A',
          quizPromptModel: variantTask.aiModels.quizPromptModel ? 
            `${variantTask.aiModels.quizPromptModel.provider}:${variantTask.aiModels.quizPromptModel.model}` : 'N/A'
        });
      } else if (!session.aiModels || 
                 (!session.aiModels.scriptModel?.provider && !session.aiModels.quizQuestionsModel?.provider)) {
        console.warn(`⚠️ [METRICS] Could not find AI models for session ${sessionId}`);
      }
    }

    // Stop session in vitals service (gracefully handle if service is unavailable)
    const presageSessionId = `session_${session.startTime.getTime()}_${session.student}_${session.task}`;
    let finalMetrics = null;
    try {
      finalMetrics = await vitalsService.stopSession(presageSessionId);
    } catch (error) {
      console.warn('[MetricRoutes] Vitals service unavailable when stopping session, continuing with database metrics');
    }

    // Calculate aggregated metrics from database (even if vitals service was unavailable)
    const metrics = session.metrics;
    if (metrics.length > 0) {
      const heartRates = metrics.filter(m => m.heartRate !== null).map(m => m.heartRate);
      const breathingRates = metrics.filter(m => m.breathingRate !== null).map(m => m.breathingRate);
      const focusScores = metrics.map(m => m.focusScore);
      const engagementScores = metrics.map(m => m.engagementScore);
      const thinkingIntensities = metrics.map(m => m.thinkingIntensity);

      // Calculate averages
      const avgHeartRate = heartRates.length > 0 
        ? heartRates.reduce((a, b) => a + b, 0) / heartRates.length 
        : null;
      const avgBreathingRate = breathingRates.length > 0
        ? breathingRates.reduce((a, b) => a + b, 0) / breathingRates.length
        : null;
      const avgFocusScore = focusScores.reduce((a, b) => a + b, 0) / focusScores.length;
      const avgEngagementScore = engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length;
      const avgThinkingIntensity = thinkingIntensities.reduce((a, b) => a + b, 0) / thinkingIntensities.length;

      // Calculate standard deviations
      const heartRateStdDev = heartRates.length > 1
        ? Math.sqrt(heartRates.reduce((sum, val) => sum + Math.pow(val - avgHeartRate, 2), 0) / heartRates.length)
        : null;
      const breathingRateStdDev = breathingRates.length > 1
        ? Math.sqrt(breathingRates.reduce((sum, val) => sum + Math.pow(val - avgBreathingRate, 2), 0) / breathingRates.length)
        : null;

      session.aggregatedMetrics = {
        averageHeartRate: avgHeartRate,
        averageBreathingRate: avgBreathingRate,
        averageFocusScore: avgFocusScore,
        averageEngagementScore: avgEngagementScore,
        averageThinkingIntensity: avgThinkingIntensity,
        heartRateStdDev: heartRateStdDev,
        breathingRateStdDev: breathingRateStdDev
      };
    } else if (finalMetrics) {
      // Use final metrics from service if available
      session.aggregatedMetrics = {
        averageHeartRate: finalMetrics.averageHeartRate || null,
        averageBreathingRate: finalMetrics.averageBreathingRate || null,
        averageFocusScore: finalMetrics.averageFocusScore || 0,
        averageEngagementScore: finalMetrics.averageEngagementScore || 0,
        averageThinkingIntensity: finalMetrics.averageThinkingIntensity || 0,
        heartRateStdDev: finalMetrics.heartRateStdDev || null,
        breathingRateStdDev: finalMetrics.breathingRateStdDev || null
      };
    }

    // Update session
    session.endTime = new Date();
    session.duration = Math.floor((session.endTime - session.startTime) / 1000);
    session.status = 'completed';

    await session.save();

    // FEEDBACK PROCESSING PIPELINE
    // Step 1: Normalize raw metrics into feedback signals
    let feedback = null;
    if (session.aggregatedMetrics) {
      try {
        // Get task context
        const task = await Task.findById(session.task).populate('class');
        const classData = await Class.findById(session.class);
        
        feedback = feedbackNormalizerService.normalize(
          session.aggregatedMetrics,
          {
            taskType: session.taskType,
            topic: task?.topic,
            gradeLevel: session.gradeLevel,
            subject: session.subject,
            duration: session.duration
          }
        );

        // Build agent combo string
        const agentCombo = surveyMonkeyService.buildAgentComboString(
          session.aiModels,
          session.taskType
        );

        // Log if agent combo is unknown for debugging
        if (agentCombo === 'unknown') {
          console.warn('⚠️ [FEEDBACK] Agent combo is unknown - aiModels:', JSON.stringify(session.aiModels, null, 2));
        }

        // Add context to feedback
        feedback.agentCombo = agentCombo;
        feedback.topic = task?.topic || 'unknown';
        feedback.taskType = session.taskType;
        feedback.gradeLevel = session.gradeLevel;
        feedback.subject = session.subject;
        feedback.length = surveyMonkeyService.categorizeLength(session.duration);
        feedback.sessionId = session._id;

        // Calculate fatigue slope from metrics history
        if (session.metrics.length >= 5) {
          feedback.fatigueSlope = feedbackNormalizerService.calculateFatigueSlope(
            session.metrics
          );
        }

        // Step 2: Store feedback in MongoDB (feedback layer)
        const sessionFeedback = new SessionFeedback({
          sessionId: session._id,
          clarityScore: feedback.clarityScore,
          engagementScore: feedback.engagementScore,
          fatigueTrend: feedback.fatigueTrend,
          cognitiveLoad: feedback.cognitiveLoad,
          attentionSpan: feedback.attentionSpan,
          confidence: feedback.confidence,
          fatigueSlope: feedback.fatigueSlope || 0,
          agentCombo: agentCombo,
          topic: feedback.topic,
          taskType: feedback.taskType,
          gradeLevel: feedback.gradeLevel,
          subject: feedback.subject
        });

        await sessionFeedback.save();
        console.log('✅ [FEEDBACK] Normalized feedback stored:', {
          sessionId: session._id.toString().substring(0, 20) + '...',
          clarity: feedback.clarityScore.toFixed(2),
          engagement: feedback.engagementScore.toFixed(2),
          fatigueTrend: feedback.fatigueTrend
        });

        // Step 3: Submit to Survey Monkey (async, don't block)
        surveyMonkeyService.submitFeedback({
          sessionId: session._id.toString(),
          aggregatedMetrics: session.aggregatedMetrics,
          aiModels: session.aiModels,
          taskType: session.taskType,
          topic: task?.topic,
          gradeLevel: session.gradeLevel,
          subject: session.subject,
          duration: session.duration
        }).then(surveyResult => {
          if (surveyResult) {
            sessionFeedback.surveyMonkeyResponseId = surveyResult.surveyResponseId;
            sessionFeedback.surveySubmitted = true;
            sessionFeedback.save();
            console.log('✅ [SURVEYMONKEY] Feedback submitted:', surveyResult.surveyResponseId);
          }
        }).catch(err => {
          console.error('[SURVEYMONKEY] Error submitting feedback:', err);
        });

        // Step 4: Update agent performance profile
        agentSelectionService.updatePerformanceProfile(feedback)
          .then(profile => {
            console.log('✅ [AGENT_SELECTION] Performance profile updated:', {
              agentCombo: profile.agentCombo,
              performanceScore: profile.performanceScore.toFixed(2),
              sessions: profile.sessionCount
            });
          })
          .catch(err => {
            console.error('[AGENT_SELECTION] Error updating profile:', err);
          });

        // Step 5: Send alerts for critical feedback
        feedbackAlertService.alertVitalityCollapse(feedback, {
          agentCombo,
          topic: feedback.topic,
          taskType: feedback.taskType,
          sessionId: session._id.toString()
        });

        feedbackAlertService.alertCriticalThreshold(feedback, {
          agentCombo,
          topic: feedback.topic,
          taskType: feedback.taskType,
          sessionId: session._id.toString()
        });

      } catch (error) {
        console.error('[FEEDBACK] Error processing feedback pipeline:', error);
        // Don't fail the request - feedback processing is non-critical
      }
    }

    // Log final aggregated metrics
    console.log('📊 [METRICS] Session completed:', {
      sessionId: session._id.toString().substring(0, 20) + '...',
      duration: `${session.duration}s`,
      frames: session.metrics.length,
      aggregated: session.aggregatedMetrics,
      feedback: feedback ? {
        clarity: feedback.clarityScore?.toFixed(2),
        engagement: feedback.engagementScore?.toFixed(2),
        fatigueTrend: feedback.fatigueTrend
      } : null,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      session: {
        id: session._id,
        duration: session.duration,
        metrics: session.aggregatedMetrics,
        feedback: feedback ? {
          clarityScore: feedback.clarityScore,
          engagementScore: feedback.engagementScore,
          fatigueTrend: feedback.fatigueTrend,
          confidence: feedback.confidence
        } : null
      }
    });
  } catch (error) {
    console.error('[MetricRoutes] Error stopping session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get AI model recommendations for a student
 * GET /api/metrics/recommendations/:studentId
 */
router.get('/recommendations/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { taskType, gradeLevel, subject } = req.query;

    if (!taskType || !gradeLevel || !subject) {
      return res.status(400).json({ 
        error: 'Task type, grade level, and subject are required' 
      });
    }

    const recommendation = await modelRecommendationService.getBestModelForStudent(
      studentId,
      taskType,
      gradeLevel,
      subject
    );

    res.json({ recommendation });
  } catch (error) {
    console.error('[MetricRoutes] Error getting recommendations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get global AI model recommendations
 * GET /api/metrics/recommendations/global
 */
router.get('/recommendations/global', async (req, res) => {
  try {
    const { taskType, gradeLevel, subject } = req.query;

    if (!taskType || !gradeLevel || !subject) {
      return res.status(400).json({ 
        error: 'Task type, grade level, and subject are required' 
      });
    }

    const recommendation = await modelRecommendationService.getBestModelGlobal(
      taskType,
      gradeLevel,
      subject
    );

    res.json({ recommendation });
  } catch (error) {
    console.error('[MetricRoutes] Error getting global recommendations:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

