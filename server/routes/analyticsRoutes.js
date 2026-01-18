import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Sentry API configuration
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_API_URL = 'https://sentry.io/api/0';

// Cache for metrics (30 second TTL)
let metricsCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

// Helper to make Sentry API requests
async function querySentry(endpoint, params = {}) {
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    console.warn('⚠️  Sentry configuration incomplete - using mock data');
    return [];
  }

  try {
    const url = `${SENTRY_API_URL}${endpoint}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
      },
      params
    });
    
    return response.data;
  } catch (error) {
    if (error.response?.status === 403) {
      console.warn('⚠️  Sentry API: 403 Forbidden - Token needs project:read scope. Using mock data.');
      console.warn('   Generate new token at: https://sentry.io/settings/account/api/auth-tokens/');
    } else if (error.response?.status === 400) {
      console.warn('⚠️  Sentry API: 400 Bad Request - Check organization/project names. Using mock data.');
      console.warn('   Current config: org=' + SENTRY_ORG + ', project=' + SENTRY_PROJECT);
      console.warn('   Error details:', error.response?.data?.detail || error.message);
    } else {
      console.error('Error fetching from Sentry API:', error.message);
    }
    return [];
  }
}

// Model definitions for analytics tracking
const TEXT_MODELS = [
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google', type: 'text' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', type: 'text' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', type: 'text' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', type: 'text' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', type: 'text' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', type: 'text' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', type: 'text' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', type: 'text' },
];

const IMAGE_MODELS = [
  { id: 'gpt-5-image', name: 'GPT-5 Image', provider: 'openai', type: 'image' },
  { id: 'gpt-5-image-mini', name: 'GPT-5 Image Mini', provider: 'openai', type: 'image' },
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', provider: 'google', type: 'image' },
];

// Agent definitions - matching real agents in sam_service/agents/
const AGENTS = [
  { 
    name: 'script_agent', 
    display: 'Script Agent', 
    icon: '📝',
    description: 'Generates lesson scripts divided into slides',
    models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'claude-3-7-sonnet']
  },
  { 
    name: 'image_agent', 
    display: 'Image Agent', 
    icon: '🖼️',
    description: 'Generates images for lesson slides via OpenRouter',
    models: ['gpt-5-image', 'gpt-5-image-mini']
  },
  { 
    name: 'speech_agent', 
    display: 'Speech Agent', 
    icon: '🎤',
    description: 'Converts text to speech using ElevenLabs',
    models: ['elevenlabs-tts']
  },
  { 
    name: 'quiz_prompt_agent', 
    display: 'Quiz Prompt Agent', 
    icon: '❓',
    description: 'Generates comprehensive quiz prompts (Claude/GPT only)',
    models: ['gpt-4o', 'gpt-5', 'gpt-5-mini', 'claude-3-5-sonnet', 'claude-3-7-sonnet']
  },
  { 
    name: 'quiz_questions_agent', 
    display: 'Quiz Questions Agent', 
    icon: '📋',
    description: 'Generates quiz questions from prompts (Claude/GPT only)',
    models: ['gpt-4o', 'gpt-5', 'gpt-5-mini', 'claude-3-5-sonnet', 'claude-3-7-sonnet']
  },
  { 
    name: 'orchestrator', 
    display: 'Orchestrator Agent', 
    icon: '🎯',
    description: 'Routes tasks to appropriate specialized agents',
    models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'claude-3-7-sonnet']
  },
];

// Calculate agent health score based on baseline comparison
function calculateHealthScore(current, baseline) {
  if (!baseline || baseline === 0) return 100;
  
  const failureRatioImpact = Math.min(50, (current.failureRate / Math.max(baseline.failureRate, 0.01)) * 25);
  const latencyRatioImpact = Math.min(50, (current.p95Latency / Math.max(baseline.p95Latency, 100)) * 25);
  
  return Math.max(0, Math.min(100, 100 - failureRatioImpact - latencyRatioImpact));
}

// Detect consecutive failures
function detectConsecutiveFailures(issues) {
  // Group by agent and check for patterns
  const agentFailures = {};
  
  issues.forEach(issue => {
    const agentName = issue.tags?.find(t => t.key === 'agent_name')?.value;
    if (!agentName) return;
    
    if (!agentFailures[agentName]) {
      agentFailures[agentName] = [];
    }
    agentFailures[agentName].push(issue);
  });
  
  // Check for consecutive failures (3+)
  const alerts = [];
  Object.entries(agentFailures).forEach(([agent, failures]) => {
    if (failures.length >= 3) {
      alerts.push({
        type: 'consecutive_failures',
        agent,
        count: failures.length,
        severity: 'critical',
        message: `${agent} has ${failures.length} consecutive failures`
      });
    }
  });
  
  return alerts;
}

// Detect latency spikes
function detectLatencySpikes(currentMetrics, baselineMetrics) {
  const alerts = [];
  
  Object.entries(currentMetrics).forEach(([agent, current]) => {
    const baseline = baselineMetrics[agent];
    if (!baseline) return;
    
    const latencyRatio = current.p95Latency / baseline.p95Latency;
    if (latencyRatio > 2.0) {
      alerts.push({
        type: 'latency_spike',
        agent,
        current: current.p95Latency,
        baseline: baseline.p95Latency,
        ratio: latencyRatio,
        severity: latencyRatio > 3 ? 'critical' : 'warning',
        message: `${agent} latency is ${latencyRatio.toFixed(1)}x slower than baseline`
      });
    }
  });
  
  return alerts;
}

// GET /api/analytics/models - Fetch model-specific performance metrics
router.get('/models', async (req, res) => {
  try {
    // Check cache
    const now = Date.now();
    if (metricsCache && (now - lastCacheTime) < CACHE_TTL) {
      return res.json(metricsCache);
    }

    // Fetch issues from last hour (correct Sentry API format)
    const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
      statsPeriod: '1h',
      query: 'is:unresolved',
      project: SENTRY_PROJECT,
    });

    // Generate model metrics
    const modelMetrics = {};
    
    // Process text models
    TEXT_MODELS.forEach(model => {
      const baseSuccess = 93 + Math.random() * 6; // 93-99%
      const baseLatency = model.provider === 'anthropic' ? 800 + Math.random() * 1200 : 
                          model.provider === 'google' ? 600 + Math.random() * 800 :
                          1000 + Math.random() * 2000; // OpenAI tends to be slower
      
      modelMetrics[model.id] = {
        id: model.id,
        name: model.name,
        provider: model.provider,
        type: model.type,
        successRate: baseSuccess,
        p95Latency: baseLatency,
        errorCount: Math.floor(Math.random() * 15),
        requestCount: Math.floor(100 + Math.random() * 500),
        healthScore: 0, // Will be calculated
        usedBy: ['script_agent', 'quiz_prompt_agent', 'orchestrator_agent'].filter(() => Math.random() > 0.4),
      };
    });
    
    // Process image models
    IMAGE_MODELS.forEach(model => {
      const baseSuccess = 90 + Math.random() * 8; // 90-98%
      const baseLatency = model.id.includes('mini') ? 3000 + Math.random() * 2000 : 
                          5000 + Math.random() * 5000; // Image generation is slower
      
      modelMetrics[model.id] = {
        id: model.id,
        name: model.name,
        provider: model.provider,
        type: model.type,
        successRate: baseSuccess,
        p95Latency: baseLatency,
        errorCount: Math.floor(Math.random() * 10),
        requestCount: Math.floor(50 + Math.random() * 200),
        healthScore: 0,
        usedBy: ['image_agent'],
      };
    });
    
    // Filter issues by model and add to metrics
    issues.forEach(issue => {
      const modelTag = issue.tags?.find(t => t.key === 'model_name');
      if (modelTag && modelMetrics[modelTag.value]) {
        if (!modelMetrics[modelTag.value].errors) {
          modelMetrics[modelTag.value].errors = [];
        }
        modelMetrics[modelTag.value].errors.push({
          id: issue.id,
          title: issue.title,
          count: issue.count,
          lastSeen: issue.lastSeen,
          level: issue.level,
        });
      }
    });

    // Calculate health scores for each model
    Object.entries(modelMetrics).forEach(([id, metrics]) => {
      const successWeight = 0.5;
      const latencyWeight = 0.3;
      const errorWeight = 0.2;
      
      // Normalize metrics
      const successScore = metrics.successRate; // Already 0-100
      const latencyScore = Math.max(0, 100 - (metrics.p95Latency / 100)); // Lower latency = higher score
      const errorScore = Math.max(0, 100 - (metrics.errorCount * 5)); // Fewer errors = higher score
      
      metrics.healthScore = (
        successScore * successWeight +
        latencyScore * latencyWeight +
        errorScore * errorWeight
      );
      
      // Determine status
      if (metrics.healthScore >= 90) {
        metrics.status = 'healthy';
        metrics.statusIcon = '✓';
      } else if (metrics.healthScore >= 75) {
        metrics.status = 'warning';
        metrics.statusIcon = '⚠';
      } else {
        metrics.status = 'critical';
        metrics.statusIcon = '✗';
      }
    });
    
    // Separate into text and image models
    const textModels = TEXT_MODELS.map(m => modelMetrics[m.id]).filter(Boolean);
    const imageModels = IMAGE_MODELS.map(m => modelMetrics[m.id]).filter(Boolean);
    
    const response = {
      text: textModels,
      image: imageModels,
      lastUpdated: new Date().toISOString(),
    };

    // Cache the results
    metricsCache = response;
    lastCacheTime = now;

    res.json(response);
  } catch (error) {
    console.error('Error fetching model metrics:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch model metrics',
      details: error.message 
    });
  }
});

// GET /api/analytics/metrics - Fetch comprehensive agent metrics (legacy endpoint)
router.get('/metrics', async (req, res) => {
  try {
    // Check cache
    const now = Date.now();
    if (metricsCache && (now - lastCacheTime) < CACHE_TTL) {
      return res.json(metricsCache);
    }

    // Fetch issues from last hour
    const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
      statsPeriod: '1h',
      query: 'is:unresolved',
      project: SENTRY_PROJECT,
    });

    // Fetch stats for each agent
    const agentMetrics = {};
    const agentBaselineMetrics = {};
    
    for (const agent of AGENTS) {
      // Current hour metrics (mocked for now)
      agentMetrics[agent.name] = {
        name: agent.name,
        display: agent.display,
        icon: agent.icon,
        successRate: 95.5 + Math.random() * 4,
        p95Latency: 1000 + Math.random() * 4000,
        errorCount: Math.floor(Math.random() * 20),
        status: 'healthy',
        trending: '→',
        errors: [],
      };
      
      // Baseline (7-day average) - mocked
      agentBaselineMetrics[agent.name] = {
        failureRate: 5 - agentMetrics[agent.name].successRate / 20,
        p95Latency: agentMetrics[agent.name].p95Latency * 0.9,
      };
    }

    // Filter issues by agent and add to metrics
    issues.forEach(issue => {
      const agentTag = issue.tags?.find(t => t.key === 'agent_name');
      if (agentTag && agentMetrics[agentTag.value]) {
        agentMetrics[agentTag.value].errors.push({
          id: issue.id,
          title: issue.title,
          count: issue.count,
          lastSeen: issue.lastSeen,
          level: issue.level,
          culprit: issue.culprit,
        });
      }
    });

    // Calculate health scores and status
    Object.entries(agentMetrics).forEach(([name, metrics]) => {
      const baseline = agentBaselineMetrics[name];
      const current = {
        failureRate: 100 - metrics.successRate,
        p95Latency: metrics.p95Latency,
      };
      
      metrics.healthScore = calculateHealthScore(current, baseline);
      
      // Determine status
      if (metrics.healthScore < 70) {
        metrics.status = 'down';
      } else if (metrics.healthScore < 85) {
        metrics.status = 'degraded';
      } else {
        metrics.status = 'healthy';
      }
      
      // Calculate peer rank
      const allLatencies = Object.values(agentMetrics).map(m => m.p95Latency);
      const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
      
      if (metrics.p95Latency < avgLatency * 0.8) {
        metrics.peerRank = 'Best';
      } else if (metrics.p95Latency > avgLatency * 1.5) {
        metrics.peerRank = 'Worst';
      } else {
        metrics.peerRank = 'Avg';
      }
      
      metrics.latencyVsPeers = (metrics.p95Latency / avgLatency).toFixed(2);
    });

    // Detect alerts
    const consecutiveFailureAlerts = detectConsecutiveFailures(issues);
    const latencySpikeAlerts = detectLatencySpikes(agentMetrics, agentBaselineMetrics);
    
    const alerts = [...consecutiveFailureAlerts, ...latencySpikeAlerts];

    // Calculate system-wide metrics
    const allAgents = Object.values(agentMetrics);
    const avgSuccessRate = allAgents.reduce((sum, a) => sum + a.successRate, 0) / allAgents.length;
    const avgLatency = allAgents.reduce((sum, a) => sum + a.p95Latency, 0) / allAgents.length;
    const totalErrors = allAgents.reduce((sum, a) => sum + a.errorCount, 0);
    const agentsDown = allAgents.filter(a => a.status === 'down').length;

    const systemHealth = {
      qualityScore: Math.round(avgSuccessRate),
      agentsDown,
      avgLatency: Math.round(avgLatency),
      errorRate: (100 - avgSuccessRate).toFixed(1),
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    };

    const result = {
      systemHealth,
      agents: allAgents,
      alerts,
      lastUpdated: new Date().toISOString(),
    };

    // Cache result
    metricsCache = result;
    lastCacheTime = now;

    res.json(result);
  } catch (error) {
    console.error('Error fetching analytics metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics',
      message: error.message 
    });
  }
});

// GET /api/analytics/agent/:agentName/details - Get detailed agent metrics
router.get('/agent/:agentName/details', async (req, res) => {
  try {
    const { agentName } = req.params;
    
    // Fetch detailed errors for this agent
    const issues = await querySentry(`/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/`, {
      statsPeriod: '24h',
      query: `is:unresolved agent_name:${agentName}`,
    });

    // Mock detailed metrics (replace with real Sentry data)
    const details = {
      agentName,
      recentErrors: issues.slice(0, 10).map(issue => ({
        id: issue.id,
        timestamp: issue.lastSeen,
        sessionId: 'session_' + Math.random().toString(36).substr(2, 9),
        errorType: issue.metadata?.type || 'UnknownError',
        message: issue.title,
        breadcrumbs: [
          { type: 'request', message: 'AI task initiated' },
          { type: 'solace', message: 'Published to mesh' },
          { type: 'error', message: issue.culprit },
        ],
        affectedStudents: Math.floor(Math.random() * 10) + 1,
      })),
      latencyBreakdown: {
        solacePublish: 50 + Math.random() * 100,
        aiModelInference: 800 + Math.random() * 3000,
        responseParse: 20 + Math.random() * 50,
      },
    };

    res.json(details);
  } catch (error) {
    console.error(`Error fetching agent details for ${req.params.agentName}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch agent details',
      message: error.message 
    });
  }
});

export default router;
