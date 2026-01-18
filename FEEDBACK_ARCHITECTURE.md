# Feedback Architecture Documentation

## Overview

This system routes student biometric metrics through a feedback processing pipeline that drives AI model selection, prompt adaptation, and quality monitoring. The architecture follows the principle: **"Feedback is not stored 'just in case' - Feedback is used to make decisions."**

## Architecture Flow

```
Raw Biometric Metrics (Vitals Service)
    ↓
Feedback Normalizer (Semantic Layer)
    ↓
+---------------------------+
|  MongoDB (Feedback Store)  |
+---------------------------+
    ↓         ↓         ↓
Agent Selector   Survey Monkey   Sentry Alerts
    ↓
Task Orchestrator
    ↓
AI Agents
```

## Components

### 1. Feedback Normalizer Service
**Location:** `server/services/feedbackNormalizerService.js`

Converts raw biometric metrics into semantic feedback signals:
- **Clarity Score** (0-1): How clear was the content?
- **Engagement Score** (0-1): How engaged was the student?
- **Fatigue Trend**: 'rising', 'stable', 'falling'
- **Cognitive Load** (0-1): Mental effort required
- **Attention Span** (0-1): Ability to maintain focus
- **Confidence** (0-1): Student confidence level

**Why this matters:** Raw metrics (blink rate, heart rate) don't directly inform decisions. Semantic signals (clarity, engagement) do.

### 2. Survey Monkey Integration
**Location:** `server/services/surveyMonkeyService.js`

Submits feedback to Survey Monkey API with custom variables:
- `agentCombo`: AI model combination used
- `topic`: Lesson/quiz topic
- `taskType`: Lesson or Quiz
- `gradeLevel`: Student grade level
- `subject`: Subject area
- `length`: Session length category

**Configuration Required:**
```env
SURVEYMONKEY_ACCESS_TOKEN=your_token
SURVEYMONKEY_SURVEY_ID=your_survey_id
SURVEYMONKEY_COLLECTOR_ID=your_collector_id
```

### 3. Agent Selection Engine
**Location:** `server/services/agentSelectionService.js`

Uses feedback to select best AI model combinations:
- Updates performance profiles from feedback
- Selects best combos based on historical performance
- Deprecates poor performing combos automatically

**MongoDB Model:** `AgentPerformance`
- Stores performance profiles per agent combo + context
- Tracks: avgClarity, avgEngagement, avgConfidence, fatigueSlope
- Calculates performance score for ranking

### 4. Prompt Adaptation Service
**Location:** `server/services/promptAdaptationService.js`

Modifies prompts based on feedback patterns:
- High fatigue → Shorter paragraphs, more breaks
- Low clarity → More examples, simpler language
- High cognitive load → Slower pacing, more repetition
- Low engagement → More interactive elements

### 5. Sentry Alert Service
**Location:** `server/services/feedbackAlertService.js`

Sends alerts for critical feedback events:
- Vitality collapse (sudden drop in metrics)
- Low clarity patterns
- Agent combo performance regression
- Critical threshold breaches

**Configuration Required:**
```env
SENTRY_DSN=your_sentry_dsn
```

### 6. Teacher Insights Service
**Location:** `server/services/teacherInsightsService.js`

Provides actionable insights for teachers:
- Overall class performance
- Performance by topic
- Performance by AI combo
- Actionable recommendations

**Endpoints:**
- `GET /api/insights/class/:classId` - Class insights
- `GET /api/insights/task/:taskId` - Task-specific insights

## Data Models

### SessionFeedback
Stores normalized feedback signals (not raw metrics):
```javascript
{
  sessionId: ObjectId,
  clarityScore: Number (0-1),
  engagementScore: Number (0-1),
  fatigueTrend: String,
  cognitiveLoad: Number (0-1),
  attentionSpan: Number (0-1),
  confidence: Number (0-1),
  agentCombo: String,
  topic: String,
  taskType: String,
  surveyMonkeyResponseId: String
}
```

### AgentPerformance
Stores performance profiles for AI combos:
```javascript
{
  agentCombo: String,
  topic: String,
  purpose: String,
  length: String,
  taskType: String,
  avgClarity: Number (0-1),
  avgEngagement: Number (0-1),
  avgConfidence: Number (0-1),
  fatigueSlope: Number,
  sessionCount: Number,
  performanceScore: Number (0-1),
  status: String ('active' | 'deprecated' | 'experimental')
}
```

## Integration Points

### Session Completion Flow
When a session completes (`POST /api/metrics/session/stop`):

1. **Normalize Metrics** → Convert raw metrics to feedback signals
2. **Store Feedback** → Save to SessionFeedback collection
3. **Submit to Survey Monkey** → Async submission with custom variables
4. **Update Agent Performance** → Update performance profiles
5. **Send Alerts** → Check for critical thresholds, send to Sentry

### Task Creation Flow
When creating a task (`POST /api/tasks/create`):

1. **Get Top Combos** → Query AgentPerformance for best combos
2. **Assign to Groups** → Distribute combos across student groups (A/B testing)
3. **Track Results** → Feedback from sessions updates performance profiles

## A/B Testing

The grouping service automatically assigns different AI combos to different student groups. Feedback from each group updates performance profiles, allowing automatic identification of best performers.

**Automatic Deprecation:**
- Combos with performance score < 0.4 (after 5+ sessions) are marked as 'deprecated'
- System prefers 'active' combos when selecting

## Environment Variables

```env
# Survey Monkey
SURVEYMONKEY_ACCESS_TOKEN=your_token
SURVEYMONKEY_SURVEY_ID=your_survey_id
SURVEYMONKEY_COLLECTOR_ID=your_collector_id

# Sentry
SENTRY_DSN=your_sentry_dsn

# MongoDB (existing)
MONGODB_URI=your_mongodb_uri
```

## Advantages Over Raw Metrics Storage

1. **Signal vs Noise**: Stores semantic signals (clarity, engagement) not raw data (blink rate)
2. **Real-Time Decisions**: System can react immediately to feedback patterns
3. **Decision Store**: MongoDB becomes a decision store, not just a data dump
4. **No Reprocessing**: Old sessions already contain interpreted results
5. **Privacy**: Derived scores are less identifying than raw biometrics

## Next Steps

1. **Configure Survey Monkey**: Set up survey with question IDs matching your survey structure
2. **Set Up Sentry**: Configure Sentry DSN for alerting
3. **Monitor Performance**: Check AgentPerformance collection to see which combos perform best
4. **Review Insights**: Use teacher insights endpoints to see class performance
5. **Iterate**: System automatically improves as more feedback is collected

## API Endpoints

### Feedback Processing
- `POST /api/metrics/session/stop` - Processes feedback after session completion

### Insights
- `GET /api/insights/class/:classId` - Get class insights
- `GET /api/insights/task/:taskId` - Get task insights

### Agent Selection
- Used internally by grouping service and task creation

## Questions?

The feedback architecture is designed to be:
- **Actionable**: Every piece of feedback drives a decision
- **Scalable**: Semantic signals scale better than raw metrics
- **Privacy-Conscious**: Derived scores are less sensitive
- **Self-Improving**: System gets better with more data

