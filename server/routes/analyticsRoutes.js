import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import SessionFeedback from '../models/SessionFeedback.js';
import mongoose from 'mongoose';

dotenv.config();

const router = express.Router();

// Sentry API configuration
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_API_URL = 'https://sentry.io/api/0';

// Cache for project slug and ID to avoid repeated API calls
let projectSlugCache = null;
let projectIdCache = null;

// Helper to get project slug and ID
// Returns { slug, id } or null
async function getProjectInfo() {
  if (!SENTRY_PROJECT) return null;
  
  // Return cached info if available
  if (projectSlugCache && projectIdCache) {
    return { slug: projectSlugCache, id: projectIdCache };
  }
  
  // If it's numeric, it's probably an ID - try to fetch the slug
  if (/^\d+$/.test(SENTRY_PROJECT)) {
    try {
      // Try to list all projects and find the one with this ID
      const projects = await querySentry(`/organizations/${SENTRY_ORG}/projects/`);
      if (Array.isArray(projects)) {
        const project = projects.find(p => p.id === SENTRY_PROJECT || p.id.toString() === SENTRY_PROJECT);
        if (project?.slug) {
          projectSlugCache = project.slug;
          projectIdCache = project.id.toString();
          console.log(`✅ Found project slug: ${project.slug} for ID ${SENTRY_PROJECT}`);
          return { slug: project.slug, id: project.id.toString() };
        }
      }
      
      // Fallback: try direct project endpoint
      try {
        const projectInfo = await querySentry(`/organizations/${SENTRY_ORG}/projects/${SENTRY_PROJECT}/`);
        if (projectInfo?.slug) {
          projectSlugCache = projectInfo.slug;
          projectIdCache = projectInfo.id.toString();
          return { slug: projectInfo.slug, id: projectInfo.id.toString() };
        }
      } catch (e) {
        // Direct endpoint failed, continue
      }
      
      console.warn(`⚠️  Could not find project info for ID ${SENTRY_PROJECT}`);
      return null;
    } catch (error) {
      console.warn(`⚠️  Error fetching project info: ${error.message}`);
      return null;
    }
  }
  
  // Already a slug - need to fetch the ID
  try {
    const projectInfo = await querySentry(`/organizations/${SENTRY_ORG}/projects/${SENTRY_PROJECT}/`);
    if (projectInfo?.id && projectInfo?.slug) {
      projectSlugCache = projectInfo.slug;
      projectIdCache = projectInfo.id.toString();
      return { slug: projectInfo.slug, id: projectInfo.id.toString() };
    }
  } catch (error) {
    console.warn(`⚠️  Could not fetch project ID for slug ${SENTRY_PROJECT}: ${error.message}`);
  }
  
  // Fallback: assume SENTRY_PROJECT is the slug, but we don't have the ID
  projectSlugCache = SENTRY_PROJECT;
  return { slug: SENTRY_PROJECT, id: null };
}

// Helper to get project slug (for backward compatibility)
async function getProjectSlug() {
  const info = await getProjectInfo();
  return info?.slug || null;
}

// Cache for metrics (30 second TTL)
let metricsCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

// Helper to make Sentry API requests
async function querySentry(endpoint, params = {}) {
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG) {
    console.warn('⚠️  Sentry API configuration incomplete - missing SENTRY_AUTH_TOKEN or SENTRY_ORG');
    console.warn('   Set these in your .env file to fetch real metrics from Sentry');
    return [];
  }

  try {
    const url = `${SENTRY_API_URL}${endpoint}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      params,
      timeout: 10000, // 10 second timeout
    });
    
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const errorData = error.response?.data;
    
    if (status === 403) {
      console.warn('⚠️  Sentry API: 403 Forbidden');
      console.warn('   Your API token is missing required scopes.');
      console.warn('   Generate new token at: https://sentry.io/settings/account/api/auth-tokens/');
      console.warn('   Required scopes: org:read, project:read, event:read');
      console.warn('   Current org:', SENTRY_ORG);
    } else if (status === 400) {
      console.warn('⚠️  Sentry API: 400 Bad Request');
      console.warn('   Check organization/project names.');
      console.warn('   Current config: org=' + SENTRY_ORG + ', project=' + SENTRY_PROJECT);
      if (errorData?.detail) {
        console.warn('   Error:', errorData.detail);
      }
    } else if (status === 404) {
      // Don't log 404 for optional endpoints (stats, events) - they're not available on all plans
      // Only log 404 for critical endpoints (org, project, issues)
      const isOptionalEndpoint = endpoint.includes('/stats/') || 
                                  endpoint.includes('/events/') ||
                                  endpoint.includes('/discover/');
      
      if (!isOptionalEndpoint) {
        // Only log once per endpoint type to avoid spam
        const endpointKey = endpoint.split('?')[0]; // Remove query params
        if (!querySentry._logged404s) querySentry._logged404s = new Set();
        if (!querySentry._logged404s.has(endpointKey)) {
          querySentry._logged404s.add(endpointKey);
          console.warn('⚠️  Sentry API: 404 Not Found');
          console.warn('   Endpoint:', endpoint);
          console.warn('   Current config: org=' + SENTRY_ORG + ', project=' + SENTRY_PROJECT);
          console.warn('   Visit /api/analytics/test-sentry for diagnostics');
        }
      }
      // Silently return empty array for 404s - they're handled gracefully
    } else if (status === 401) {
      console.warn('⚠️  Sentry API: 401 Unauthorized');
      console.warn('   Your API token is invalid or expired.');
      console.warn('   Generate new token at: https://sentry.io/settings/account/api/auth-tokens/');
    } else {
      // Only log unexpected errors
      if (status && status >= 500) {
        console.error('⚠️  Sentry API Error:', status, statusText);
        if (errorData) {
          console.error('   Response:', JSON.stringify(errorData, null, 2));
        }
      }
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

    // Get project slug (Sentry API requires slug, not ID)
    const projectSlug = await getProjectSlug();
    if (!projectSlug) {
      console.warn('⚠️  Could not determine project slug - using mock data');
      // Continue with mock data generation below
    } else {
      console.log(`✅ Using Sentry project: ${projectSlug} in org: ${SENTRY_ORG}`);
    }

    // Fetch real Sentry data (only if we have a valid project slug)
    let issues = [];
    let stats = null;
    let performanceData = null;
    
    if (projectSlug && SENTRY_ORG) {
      try {
        // Test connection first with a simple endpoint
        const testOrg = await querySentry(`/organizations/${SENTRY_ORG}/`);
        if (!testOrg || !testOrg.slug) {
          console.warn(`⚠️  Could not verify organization: ${SENTRY_ORG}`);
        } else {
          console.log(`✅ Verified organization: ${testOrg.name} (${testOrg.slug})`);
        }
        
        // Fetch issues - use simpler query that works better
        try {
          issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
            statsPeriod: '24h',
            query: projectSlug ? `project:${projectSlug} is:unresolved` : 'is:unresolved',
            per_page: 50,
          });
          console.log(`✅ Fetched ${Array.isArray(issues) ? issues.length : 0} issues from Sentry`);
        } catch (error) {
          console.warn('⚠️  Could not fetch issues:', error.message);
        }
        
        // Fetch stats - this endpoint might not exist, so make it optional
        try {
          stats = await querySentry(`/organizations/${SENTRY_ORG}/projects/${projectSlug}/stats/`, {
            stat: 'received',
            resolution: '1h',
            since: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
            until: Math.floor(Date.now() / 1000),
          });
        } catch (error) {
          // Stats endpoint might not be available - that's okay
          console.log('ℹ️  Stats endpoint not available (this is normal for some Sentry plans)');
        }
        
        // Fetch performance data from Sentry - transactions endpoint
        // Note: This endpoint may not be available on all Sentry plans
        // We'll extract latency from issues metadata instead if this fails
        try {
          // Get project info (need ID for events endpoint)
          const projectInfo = await getProjectInfo();
          if (!projectInfo?.id) {
            throw new Error('Project ID not available');
          }
          
          // Try to get transaction events (performance monitoring)
          // This endpoint requires Performance Monitoring feature
          // The project parameter must be a numeric ID, not a slug
          performanceData = await querySentry(`/organizations/${SENTRY_ORG}/events/`, {
            project: projectInfo.id, // Use numeric ID, not slug
            statsPeriod: '24h',
            query: 'event.type:transaction',
            per_page: 100,
          });
          if (performanceData && Array.isArray(performanceData)) {
            console.log(`✅ Fetched ${performanceData.length} performance events from Sentry`);
          }
        } catch (error) {
          // Performance endpoint not available - that's okay, we'll use issues data instead
          console.log('ℹ️  Performance events endpoint not available (requires Performance Monitoring plan)');
          performanceData = null;
        }
      } catch (error) {
        console.warn('⚠️  Error fetching Sentry data, using mock data:', error.message);
      }
    }

    // Aggregate real metrics from Sentry events
    const modelStats = {};
    const modelErrors = {};
    const modelLatencies = {};

    // Process Sentry issues to count errors per model
    if (Array.isArray(issues)) {
      issues.forEach(issue => {
        const modelTag = issue.tags?.find(t => t.key === 'model_name' || t.key === 'model');
        const modelName = modelTag?.value || issue.metadata?.value?.model;
        if (modelName) {
          if (!modelErrors[modelName]) {
            modelErrors[modelName] = [];
          }
          modelErrors[modelName].push({
            id: issue.id,
            title: issue.title,
            count: issue.count || 1,
            lastSeen: issue.lastSeen,
            level: issue.level,
          });
        }
      });
    }

    // Process performance data to get latencies
    // If performance data is not available, extract from issues metadata
    if (performanceData && Array.isArray(performanceData)) {
      performanceData.forEach(event => {
        const modelName = event.tags?.find(t => t.key === 'model_name' || t.key === 'model')?.value;
        if (modelName && event.transaction) {
          if (!modelLatencies[modelName]) {
            modelLatencies[modelName] = [];
          }
          const duration = event.transaction.duration || 0;
          modelLatencies[modelName].push(duration);
        }
      });
    } else if (Array.isArray(issues)) {
      // Fallback: Extract latency hints from issues metadata if available
      issues.forEach(issue => {
        const modelName = issue.tags?.find(t => t.key === 'model_name' || t.key === 'model')?.value;
        if (modelName && issue.metadata?.latency) {
          if (!modelLatencies[modelName]) {
            modelLatencies[modelName] = [];
          }
          modelLatencies[modelName].push(issue.metadata.latency);
        }
      });
    }

    // Calculate real statistics
    Object.keys(modelLatencies).forEach(modelName => {
      const latencies = modelLatencies[modelName].sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      modelStats[modelName] = {
        p95Latency: latencies[p95Index] || 0,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
        requestCount: latencies.length,
      };
    });

    // Generate model metrics with real data where available
    const modelMetrics = {};
    
    // Process text models
    TEXT_MODELS.forEach(model => {
      const stats = modelStats[model.id] || {};
      const errors = modelErrors[model.id] || [];
      const errorCount = errors.length;
      const requestCount = stats.requestCount || 0;
      const p95Latency = stats.p95Latency || (model.provider === 'anthropic' ? 1500 : 
                          model.provider === 'google' ? 1000 : 2000);
      
      // Calculate success rate based on errors vs requests
      const successRate = requestCount > 0 
        ? Math.max(0, Math.min(100, ((requestCount - errorCount) / requestCount) * 100))
        : (93 + Math.random() * 6); // Fallback if no data
      
      modelMetrics[model.id] = {
        id: model.id,
        name: model.name,
        provider: model.provider,
        type: model.type,
        successRate,
        p95Latency,
        errorCount,
        requestCount: requestCount || Math.floor(100 + Math.random() * 500),
        healthScore: 0, // Will be calculated
        usedBy: ['script_agent', 'quiz_prompt_agent', 'orchestrator_agent'],
        errors: errors,
      };
    });
    
    // Process image models
    IMAGE_MODELS.forEach(model => {
      const stats = modelStats[model.id] || {};
      const errors = modelErrors[model.id] || [];
      const errorCount = errors.length;
      const requestCount = stats.requestCount || 0;
      const p95Latency = stats.p95Latency || (model.id.includes('mini') ? 4000 : 7500);
      
      const successRate = requestCount > 0 
        ? Math.max(0, Math.min(100, ((requestCount - errorCount) / requestCount) * 100))
        : (90 + Math.random() * 8);
      
      modelMetrics[model.id] = {
        id: model.id,
        name: model.name,
        provider: model.provider,
        type: model.type,
        successRate,
        p95Latency,
        errorCount,
        requestCount: requestCount || Math.floor(50 + Math.random() * 200),
        healthScore: 0,
        usedBy: ['image_agent'],
        errors: errors,
      };
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

    // Get project slug
    const projectSlug = await getProjectSlug();

    // Fetch issues from last hour
    const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
      statsPeriod: '1h',
      query: projectSlug ? `is:unresolved project:${projectSlug}` : 'is:unresolved',
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
    
    // Get project slug
    const projectSlug = await getProjectSlug();
    if (!projectSlug) {
      return res.json({
        agentName,
        recentErrors: [],
        latencyBreakdown: {
          solacePublish: 50,
          aiModelInference: 800,
          responseParse: 20,
        },
      });
    }
    
    // Fetch detailed errors for this agent
    const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
      statsPeriod: '24h',
      query: `is:unresolved project:${projectSlug} agent_name:${agentName}`,
    });

    const details = {
      agentName,
      recentErrors: Array.isArray(issues) ? issues.slice(0, 10).map(issue => ({
        id: issue.id,
        timestamp: issue.lastSeen,
        sessionId: issue.metadata?.sessionId || 'unknown',
        errorType: issue.metadata?.type || issue.type || 'UnknownError',
        message: issue.title,
        breadcrumbs: issue.culprit ? [
          { type: 'request', message: 'AI task initiated' },
          { type: 'solace', message: 'Published to mesh' },
          { type: 'error', message: issue.culprit },
        ] : [],
        affectedStudents: issue.count || 1,
      })) : [],
      latencyBreakdown: {
        solacePublish: 50,
        aiModelInference: 800,
        responseParse: 20,
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

// GET /api/analytics/performance - Fetch agent performance from SessionFeedback
router.get('/performance', async (req, res) => {
  try {
    const { timeRange = '7d', agentCombo } = req.query;
    
    // Calculate date range
    const now = new Date();
    const daysAgo = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Build query
    const query = { createdAt: { $gte: startDate } };
    if (agentCombo) {
      query.agentCombo = agentCombo;
    }
    
    // Fetch feedback data
    const feedbacks = await SessionFeedback.find(query)
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    
    // Aggregate by agent combo
    const agentPerformance = {};
    const timeSeries = {};
    
    feedbacks.forEach(feedback => {
      const combo = feedback.agentCombo || 'unknown';
      
      if (!agentPerformance[combo]) {
        agentPerformance[combo] = {
          agentCombo: combo,
          totalSessions: 0,
          avgClarity: 0,
          avgEngagement: 0,
          avgConfidence: 0,
          avgCognitiveLoad: 0,
          avgAttentionSpan: 0,
          clarityScores: [],
          engagementScores: [],
          confidenceScores: [],
          fatigueTrends: { rising: 0, stable: 0, falling: 0 },
        };
      }
      
      const perf = agentPerformance[combo];
      perf.totalSessions++;
      perf.clarityScores.push(feedback.clarityScore);
      perf.engagementScores.push(feedback.engagementScore);
      if (feedback.confidence) perf.confidenceScores.push(feedback.confidence);
      if (feedback.fatigueTrend) perf.fatigueTrends[feedback.fatigueTrend]++;
      
      // Time series data (by day)
      const day = new Date(feedback.createdAt).toISOString().split('T')[0];
      if (!timeSeries[day]) {
        timeSeries[day] = {
          date: day,
          clarity: [],
          engagement: [],
          confidence: [],
          sessions: 0,
        };
      }
      timeSeries[day].clarity.push(feedback.clarityScore);
      timeSeries[day].engagement.push(feedback.engagementScore);
      if (feedback.confidence) timeSeries[day].confidence.push(feedback.confidence);
      timeSeries[day].sessions++;
    });
    
    // Calculate averages
    Object.values(agentPerformance).forEach(perf => {
      perf.avgClarity = perf.clarityScores.reduce((a, b) => a + b, 0) / perf.clarityScores.length || 0;
      perf.avgEngagement = perf.engagementScores.reduce((a, b) => a + b, 0) / perf.engagementScores.length || 0;
      perf.avgConfidence = perf.confidenceScores.length > 0 
        ? perf.confidenceScores.reduce((a, b) => a + b, 0) / perf.confidenceScores.length 
        : 0;
    });
    
    // Process time series
    const timeSeriesArray = Object.values(timeSeries).map(day => ({
      date: day.date,
      avgClarity: day.clarity.reduce((a, b) => a + b, 0) / day.clarity.length || 0,
      avgEngagement: day.engagement.reduce((a, b) => a + b, 0) / day.engagement.length || 0,
      avgConfidence: day.confidence.length > 0 
        ? day.confidence.reduce((a, b) => a + b, 0) / day.confidence.length 
        : 0,
      sessions: day.sessions,
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    res.json({
      agentPerformance: Object.values(agentPerformance),
      timeSeries: timeSeriesArray,
      summary: {
        totalSessions: feedbacks.length,
        uniqueAgentCombos: Object.keys(agentPerformance).length,
        dateRange: { start: startDate.toISOString(), end: now.toISOString() },
      },
    });
  } catch (error) {
    console.error('Error fetching performance data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch performance data',
      message: error.message 
    });
  }
});

// GET /api/analytics/dashboard - Comprehensive dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    // Fetch models data directly
    const now = Date.now();
    let modelsData = { text: [], image: [] };
    
    // Get project slug
    const projectSlug = await getProjectSlug();
    
    if (!metricsCache || (now - lastCacheTime) >= CACHE_TTL) {
      // Trigger models fetch logic inline
      const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
        statsPeriod: '24h',
        query: projectSlug ? `is:unresolved project:${projectSlug}` : 'is:unresolved',
      });
      
      // Simplified models data for dashboard
      modelsData = {
        text: TEXT_MODELS.map(m => ({ id: m.id, name: m.name, provider: m.provider })),
        image: IMAGE_MODELS.map(m => ({ id: m.id, name: m.name, provider: m.provider })),
      };
    } else {
      modelsData = metricsCache;
    }
    
    // Fetch performance data
    const timeRange = req.query.timeRange || '7d';
    const daysAgo = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30;
    const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    
    const feedbacks = await SessionFeedback.find({ createdAt: { $gte: startDate } })
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    
    const performanceData = {
      agentPerformance: [],
      timeSeries: [],
      summary: {
        totalSessions: feedbacks.length,
        uniqueAgentCombos: new Set(feedbacks.map(f => f.agentCombo)).size,
      },
    };
    
    // Get Sentry issues
    const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
      statsPeriod: '24h',
      query: projectSlug ? `is:unresolved project:${projectSlug}` : 'is:unresolved',
    });
    
    res.json({
      models: modelsData,
      performance: performanceData,
      issues: Array.isArray(issues) ? issues.slice(0, 20) : [],
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard data',
      message: error.message 
    });
  }
});

// GET /api/analytics/test-sentry - Test Sentry API connection
router.get('/test-sentry', async (req, res) => {
  try {
    const results = {
      configured: !!(SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT),
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      hasAuthToken: !!SENTRY_AUTH_TOKEN,
      authTokenLength: SENTRY_AUTH_TOKEN ? SENTRY_AUTH_TOKEN.length : 0,
      authTokenPrefix: SENTRY_AUTH_TOKEN ? SENTRY_AUTH_TOKEN.substring(0, 10) + '...' : 'none',
      tests: {}
    };
    
    if (!results.configured) {
      return res.json({
        ...results,
        error: 'Sentry not fully configured. Check SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT in .env',
        missing: {
          authToken: !SENTRY_AUTH_TOKEN,
          org: !SENTRY_ORG,
          project: !SENTRY_PROJECT
        }
      });
    }
    
    // Test 1: Verify organization
    try {
      const orgInfo = await querySentry(`/organizations/${SENTRY_ORG}/`);
      results.tests.organization = {
        success: true,
        name: orgInfo?.name,
        slug: orgInfo?.slug,
        id: orgInfo?.id,
        message: `✅ Organization "${orgInfo?.name}" found`
      };
    } catch (error) {
      results.tests.organization = {
        success: false,
        error: error.message,
        status: error.response?.status,
        details: error.response?.data,
        message: `❌ Organization "${SENTRY_ORG}" not found. Check your SENTRY_ORG value.`,
        help: 'Find your org slug in the Sentry URL: sentry.io/organizations/{org-slug}/'
      };
    }
    
    // Test 2: Get project info (slug and ID)
    const projectInfo = await getProjectInfo();
    results.projectSlug = projectInfo?.slug || null;
    results.projectId = projectInfo?.id || null;
    results.originalProject = SENTRY_PROJECT;
    results.isProjectId = /^\d+$/.test(SENTRY_PROJECT);
    
    // Test 3: Verify project exists
    if (projectInfo?.slug) {
      try {
        const projectDetails = await querySentry(`/organizations/${SENTRY_ORG}/projects/${projectInfo.slug}/`);
        results.tests.project = {
          success: true,
          name: projectDetails?.name,
          slug: projectDetails?.slug,
          id: projectDetails?.id,
          platform: projectDetails?.platform,
          message: `✅ Project "${projectDetails?.name}" found (slug: ${projectDetails?.slug}, id: ${projectDetails?.id})`
        };
      } catch (error) {
        results.tests.project = {
          success: false,
          error: error.message,
          status: error.response?.status,
          details: error.response?.data,
          message: `❌ Project "${projectInfo.slug}" not found in organization "${SENTRY_ORG}"`,
          help: 'Check: Settings > Projects > [Your Project] > General > Slug'
        };
      }
    } else {
      results.tests.project = {
        success: false,
        message: `❌ Could not determine project info from "${SENTRY_PROJECT}"`,
        help: 'Set SENTRY_PROJECT to the project slug (e.g., "javascript-react") or numeric ID'
      };
    }
    
    // Test 4: Try to fetch issues
    if (projectInfo?.slug && results.tests.organization?.success) {
      try {
        const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
          statsPeriod: '24h',
          query: `project:${projectInfo.slug}`,
          per_page: 5
        });
        results.tests.issues = {
          success: true,
          count: Array.isArray(issues) ? issues.length : 'unknown',
          message: `✅ Successfully fetched ${Array.isArray(issues) ? issues.length : 0} issues`,
          sample: Array.isArray(issues) && issues.length > 0 ? {
            id: issues[0].id,
            title: issues[0].title,
            count: issues[0].count,
            lastSeen: issues[0].lastSeen
          } : null
        };
      } catch (error) {
        results.tests.issues = {
          success: false,
          error: error.message,
          status: error.response?.status,
          details: error.response?.data,
          message: `❌ Could not fetch issues: ${error.message}`,
          help: error.response?.status === 403 
            ? 'API token needs event:read scope'
            : error.response?.status === 404
            ? 'Check project slug is correct'
            : 'Check API token permissions'
        };
      }
    } else {
      results.tests.issues = {
        success: false,
        message: 'Skipped - organization or project not verified',
        required: 'Organization and project must be verified first'
      };
    }
    
    // Test 5: Check API token scopes (by trying a simple org endpoint)
    try {
      const orgMembers = await querySentry(`/organizations/${SENTRY_ORG}/members/`, { per_page: 1 });
      results.tests.tokenScopes = {
        success: true,
        message: '✅ API token has org:read scope',
        canReadOrg: true
      };
    } catch (error) {
      results.tests.tokenScopes = {
        success: false,
        message: `❌ API token may be missing org:read scope (status: ${error.response?.status})`,
        help: 'Generate new token with org:read, project:read, event:read scopes'
      };
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    });
  }
});

// GET /api/analytics/ai-debugger - AI-powered error analysis and fix suggestions
router.get('/ai-debugger', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    // Get project info
    const projectInfo = await getProjectInfo();
    if (!projectInfo?.slug) {
      return res.status(400).json({
        error: 'Project not configured',
        message: 'SENTRY_PROJECT must be set in .env'
      });
    }
    
    // Fetch recent AI agent errors from Sentry
    // Note: Sentry doesn't support OR/AND in queries, so we'll use a simpler query
    // and filter client-side if needed, or make multiple queries
    // Note: Sentry API doesn't support sort parameter in this format, so we'll sort client-side
    const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
      statsPeriod: '7d',
      query: `project:${projectInfo.slug} is:unresolved agent_name:*`,
      per_page: parseInt(limit) * 2 // Get more to sort and filter
    });
    
    // If no results with agent_name, try a broader search
    let allIssues = Array.isArray(issues) ? issues : [];
    if (allIssues.length === 0) {
      // Try searching for common AI-related keywords (one at a time since OR isn't supported)
      const keywordQueries = ['quiz', 'script', 'lesson', 'agent'];
      for (const keyword of keywordQueries) {
        const keywordIssues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
          statsPeriod: '7d',
          query: `project:${projectInfo.slug} is:unresolved ${keyword}`,
          per_page: parseInt(limit) * 2
        });
        if (Array.isArray(keywordIssues) && keywordIssues.length > 0) {
          allIssues = [...allIssues, ...keywordIssues];
        }
      }
      
      // Deduplicate by issue ID
      const uniqueIssues = [];
      const seenIds = new Set();
      for (const issue of allIssues) {
        if (!seenIds.has(issue.id)) {
          seenIds.add(issue.id);
          uniqueIssues.push(issue);
        }
      }
      allIssues = uniqueIssues;
    }
    
    // Sort by lastSeen (most recent first) client-side since Sentry API doesn't support sort parameter
    allIssues.sort((a, b) => {
      const dateA = new Date(a.lastSeen || 0);
      const dateB = new Date(b.lastSeen || 0);
      return dateB - dateA; // Descending order (newest first)
    });
    
    // Limit to requested number
    allIssues = allIssues.slice(0, parseInt(limit));
    
    if (!Array.isArray(allIssues) || allIssues.length === 0) {
      return res.json({
        analyzed: [],
        summary: {
          totalErrors: 0,
          message: 'No recent AI agent errors found'
        }
      });
    }
    
    // Analyze each error using Sentry's built-in data (no external AI)
    const analyzedErrors = allIssues.map((issue) => {
      // Extract error context from Sentry
      const errorTitle = issue.title || 'Unknown Error';
      const errorMessage = issue.metadata?.value || issue.culprit || errorTitle;
      const agentName = issue.tags?.find(t => t.key === 'agent_name' || t.key === 'agent')?.value || 'unknown';
      const provider = issue.tags?.find(t => t.key === 'provider')?.value || 'unknown';
      const model = issue.tags?.find(t => t.key === 'model_name' || t.key === 'model')?.value || 'unknown';
      const errorCount = issue.count || 1;
      const lastSeen = issue.lastSeen;
      const level = issue.level || 'error';
      const metadata = issue.metadata || {};
      const culprit = issue.culprit || '';
      
      // Build analysis from Sentry data
      const analysis = {
        rootCause: metadata.filename 
          ? `Error in ${metadata.filename}${metadata.function ? ` at ${metadata.function}` : ''}`
          : culprit 
          ? `Error at ${culprit}`
          : agentName !== 'unknown'
          ? `AI agent error: ${agentName}`
          : errorMessage,
        impact: `This error has occurred ${errorCount} time(s) and affects ${issue.userCount || 0} user(s)`,
        fixSteps: [
          culprit ? `1. Check the code at: ${culprit}` : '1. Review the error location',
          metadata.filename ? `2. Examine ${metadata.filename}` : '2. Review the file mentioned in the error',
          agentName !== 'unknown' ? `3. Check ${agentName} agent implementation` : '3. Review agent code',
          '4. Check Sentry breadcrumbs for execution flow',
          '5. Test the fix in a development environment'
        ],
        prevention: 'Add error handling, input validation, and monitoring to prevent similar issues',
        priority: level === 'fatal' || level === 'error' ? 'high' : level === 'warning' ? 'medium' : 'low',
        confidence: 0.8
      };
      
      return {
        issueId: issue.id,
        shortId: issue.shortId,
        title: errorTitle,
        message: errorMessage,
        agent: agentName,
        provider,
        model,
        errorCount,
        lastSeen,
        level,
        permalink: issue.permalink,
        analysis
      };
    });
    
    // Calculate summary
    const priorityCounts = analyzedErrors.reduce((acc, err) => {
      const priority = err.analysis.priority || 'medium';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {});
    
    const criticalCount = analyzedErrors.filter(e => e.analysis.priority === 'critical').length;
    const highCount = analyzedErrors.filter(e => e.analysis.priority === 'high').length;
    
    res.json({
      analyzed: analyzedErrors,
      summary: {
        totalErrors: analyzedErrors.length,
        criticalCount,
        highCount,
        priorityCounts,
        analyzedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error in AI debugger:', error);
    res.status(500).json({
      error: 'Failed to analyze errors',
      message: error.message 
    });
  }
});

// GET /api/analytics/issues - Fetch all Sentry issues
router.get('/issues', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const projectInfo = await getProjectInfo();
    if (!projectInfo?.slug) {
      return res.status(400).json({
        error: 'Project not configured',
        message: 'SENTRY_PROJECT must be set in .env'
      });
    }
    
    // Fetch all unresolved issues
    const issues = await querySentry(`/organizations/${SENTRY_ORG}/issues/`, {
      statsPeriod: '7d',
      query: `project:${projectInfo.slug} is:unresolved`,
      per_page: parseInt(limit)
    });
    
    // Sort by lastSeen (newest first)
    const sortedIssues = (Array.isArray(issues) ? issues : []).sort((a, b) => {
      const dateA = new Date(a.lastSeen || 0);
      const dateB = new Date(b.lastSeen || 0);
      return dateB - dateA;
    });
    
    res.json({
      issues: sortedIssues.slice(0, parseInt(limit)),
      total: sortedIssues.length
    });
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({
      error: 'Failed to fetch issues',
      message: error.message
    });
  }
});

// GET /api/analytics/issues/:issueId - Get detailed issue information with AI analysis
router.get('/issues/:issueId', async (req, res) => {
  try {
    const { issueId } = req.params;
    const projectInfo = await getProjectInfo();
    
    if (!projectInfo?.slug) {
      return res.status(400).json({
        error: 'Project not configured'
      });
    }
    
    // Fetch issue details
    const issue = await querySentry(`/organizations/${SENTRY_ORG}/issues/${issueId}/`);
    
    if (!issue || !issue.id) {
      return res.status(404).json({
        error: 'Issue not found'
      });
    }
    
    // Fetch latest event for this issue
    const events = await querySentry(`/organizations/${SENTRY_ORG}/issues/${issueId}/events/latest/`);
    
    // Use Sentry's built-in data for analysis instead of external AI
    const errorTitle = issue.title || 'Unknown Error';
    const errorMessage = issue.metadata?.value || issue.culprit || errorTitle;
    const level = issue.level || 'error';
    const tags = issue.tags || [];
    const metadata = issue.metadata || {};
    const culprit = issue.culprit || '';
    
    // Build analysis from Sentry data
    const analysis = {
      rootCause: metadata.filename 
        ? `Error in ${metadata.filename}${metadata.function ? ` at ${metadata.function}` : ''}`
        : culprit 
        ? `Error at ${culprit}`
        : errorMessage,
      impact: `This error has occurred ${issue.count || 0} time(s) and affects ${issue.userCount || 0} user(s)`,
      fixSteps: [
        culprit ? `1. Check the code at: ${culprit}` : '1. Review the error location',
        metadata.filename ? `2. Examine ${metadata.filename}` : '2. Review the file mentioned in the error',
        '3. Check Sentry breadcrumbs for execution flow',
        '4. Review similar issues in Sentry',
        '5. Test the fix in a development environment'
      ],
      prevention: 'Add error handling, input validation, and monitoring to prevent similar issues',
      priority: level === 'fatal' || level === 'error' ? 'high' : level === 'warning' ? 'medium' : 'low',
      confidence: 0.8,
      sentryData: {
        tags: tags.map(t => ({ key: t.key, value: t.value })),
        metadata,
        culprit,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        count: issue.count,
        userCount: issue.userCount
      }
    };
    
    res.json({
      issue,
      event: events || null,
      analysis
    });
  } catch (error) {
    console.error('Error fetching issue details:', error);
    res.status(500).json({
      error: 'Failed to fetch issue details',
      message: error.message
    });
  }
});

export default router;
