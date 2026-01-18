import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import {
  ChartBarIcon, ClockIcon, CheckCircleIcon, XCircleIcon,
  ArrowTrendingUpIcon, ArrowTrendingDownIcon
} from '@heroicons/react/24/solid';
import './DeveloperAnalytics.css';

export default function DeveloperAnalytics() {
  const navigate = useNavigate();
  const [models, setModels] = useState({ text: [], image: [] });
  const [performance, setPerformance] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('healthScore');
  const [sortOrder, setSortOrder] = useState('desc');
  const [activeTab, setActiveTab] = useState('text');
  const [expandedModel, setExpandedModel] = useState(null);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 45000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      // Fetch models (required)
      const modelsRes = await fetch('/api/analytics/models');
      if (!modelsRes.ok) {
        throw new Error('Failed to fetch model metrics');
      }
      const modelsData = await modelsRes.json();
      setModels(modelsData);
      
      // Fetch performance data (optional - may not be available if server not restarted)
      try {
        const performanceRes = await fetch(`/api/analytics/performance?timeRange=${timeRange}`);
        if (performanceRes.ok) {
          const performanceData = await performanceRes.json();
          setPerformance(performanceData);
        } else {
          console.warn('Performance endpoint not available (404) - server may need restart');
          setPerformance({ agentPerformance: [], timeSeries: [], summary: { totalSessions: 0, uniqueAgentCombos: 0 } });
        }
      } catch (err) {
        console.warn('Failed to fetch performance data:', err);
        setPerformance({ agentPerformance: [], timeSeries: [], summary: { totalSessions: 0, uniqueAgentCombos: 0 } });
      }
      
      // Fetch dashboard data (optional)
      try {
        const dashboardRes = await fetch('/api/analytics/dashboard');
        if (dashboardRes.ok) {
          const dashboardData = await dashboardRes.json();
          setDashboard(dashboardData);
        }
      } catch (err) {
        // Dashboard data is optional, ignore errors
        console.warn('Dashboard endpoint not available:', err);
      }
      
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError(err.message);
      setLoading(false);
    }
  };


  const getSortedModels = (modelList) => {
    return [...modelList].sort((a, b) => {
      let aVal, bVal;
      
      switch(sortBy) {
        case 'healthScore':
          aVal = a.healthScore;
          bVal = b.healthScore;
          break;
        case 'successRate':
          aVal = a.successRate;
          bVal = b.successRate;
          break;
        case 'latency':
          aVal = a.p95Latency;
          bVal = b.p95Latency;
          break;
        case 'errors':
          aVal = a.errorCount;
          bVal = b.errorCount;
          break;
        default:
          aVal = a.healthScore;
          bVal = b.healthScore;
      }
      
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getProviderBadgeColor = (provider) => {
    switch(provider) {
      case 'openai': return '#10a37f';
      case 'anthropic': return '#d97757';
      case 'google': return '#4285f4';
      default: return '#666';
    }
  };

  // Prepare chart data
  const prepareLatencyChartData = () => {
    const allModels = [...models.text, ...models.image];
    return allModels
      .sort((a, b) => b.p95Latency - a.p95Latency)
      .slice(0, 10)
      .map(m => ({
        name: m.name.length > 15 ? m.name.substring(0, 15) + '...' : m.name,
        latency: Math.round(m.p95Latency),
        success: Math.round(m.successRate),
      }));
  };

  const prepareSuccessRateChartData = () => {
    const allModels = [...models.text, ...models.image];
    return allModels.map(m => ({
      name: m.name.length > 20 ? m.name.substring(0, 20) + '...' : m.name,
      success: Math.round(m.successRate),
      errors: m.errorCount,
    }));
  };

  const preparePerformanceTimeSeries = () => {
    if (!performance?.timeSeries) return [];
    return performance.timeSeries.map(day => ({
      date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      clarity: Math.round(day.avgClarity * 100),
      engagement: Math.round(day.avgEngagement * 100),
      confidence: Math.round(day.avgConfidence * 100),
      sessions: day.sessions,
    }));
  };

  const prepareAgentPerformanceData = () => {
    if (!performance?.agentPerformance) return [];
    
    // Helper to format agent combo name for display
    const formatAgentName = (combo) => {
      if (!combo || combo === 'unknown') return 'Unknown';
      
      // Replace common patterns for better readability
      let formatted = combo
        .replace(/openai:/g, 'OpenAI ')
        .replace(/anthropic:/g, 'Anthropic ')
        .replace(/google:/g, 'Google ')
        .replace(/\+/g, ' + ')
        .replace(/gpt-4o/g, 'GPT-4o')
        .replace(/gpt-5/g, 'GPT-5')
        .replace(/gpt-5-mini/g, 'GPT-5 Mini')
        .replace(/gpt-5-image/g, 'GPT-5 Image')
        .replace(/gpt-5-image-mini/g, 'GPT-5 Image Mini')
        .replace(/claude-3-5-sonnet/g, 'Claude 3.5 Sonnet')
        .replace(/claude-3-7-sonnet/g, 'Claude 3.7 Sonnet')
        .replace(/gemini-2\.5-flash-lite/g, 'Gemini 2.5 Flash Lite')
        .replace(/gemini-2\.5-flash/g, 'Gemini 2.5 Flash')
        .replace(/gemini-2\.5-pro/g, 'Gemini 2.5 Pro');
      
      return formatted;
    };
    
    return performance.agentPerformance
      .sort((a, b) => {
        const totalA = (a.avgClarity + a.avgEngagement + a.avgConfidence) / 3;
        const totalB = (b.avgClarity + b.avgEngagement + b.avgConfidence) / 3;
        return totalB - totalA;
      })
      .slice(0, 10)
      .map(agent => ({
        agent: formatAgentName(agent.agentCombo),
        agentComboFull: agent.agentCombo || 'Unknown', // Keep full name for tooltip
        clarity: Math.round(agent.avgClarity * 100),
        engagement: Math.round(agent.avgEngagement * 100),
        confidence: Math.round(agent.avgConfidence * 100),
        sessions: agent.totalSessions,
      }));
  };

  const prepareProviderDistribution = () => {
    const providerCounts = {};
    [...models.text, ...models.image].forEach(model => {
      providerCounts[model.provider] = (providerCounts[model.provider] || 0) + 1;
    });
    return Object.entries(providerCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  };

  const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b'];

  if (loading) {
    return (
      <div className="analytics-container">
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '60vh',
          gap: '1rem'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid #f3f4f6',
            borderTop: '4px solid #667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{ color: '#6b7280', fontSize: '16px', fontWeight: 500 }}>Loading analytics data...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-container">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '1rem',
          padding: '2rem'
        }}>
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#fee2e2',
            borderRadius: '12px',
            border: '1px solid #fecaca',
            maxWidth: '500px',
            width: '100%'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#991b1b', fontSize: '18px' }}>Error Loading Analytics</h3>
            <p style={{ margin: '0 0 1rem 0', color: '#7f1d1d', fontSize: '14px' }}>{error}</p>
            <button 
              onClick={fetchAllData}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#667eea',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentModels = activeTab === 'text' ? models.text : models.image;
  const sortedModels = getSortedModels(currentModels);
  const latencyChartData = prepareLatencyChartData();
  const successChartData = prepareSuccessRateChartData();
  const timeSeriesData = preparePerformanceTimeSeries();
  const agentPerfData = prepareAgentPerformanceData();
  const providerData = prepareProviderDistribution();

  // Calculate summary stats
  const totalRequests = [...models.text, ...models.image].reduce((sum, m) => sum + (m.requestCount || 0), 0);
  const avgSuccessRate = [...models.text, ...models.image].reduce((sum, m) => sum + m.successRate, 0) / (models.text.length + models.image.length) || 0;
  const totalErrors = [...models.text, ...models.image].reduce((sum, m) => sum + m.errorCount, 0);
  const avgLatency = [...models.text, ...models.image].reduce((sum, m) => sum + m.p95Latency, 0) / (models.text.length + models.image.length) || 0;

  return (
    <div className="developer-analytics">
      <div className="analytics-container">
        <div className="analytics-header">
          <div>
            <h1>AI Model Performance Analytics</h1>
            <p className="subtitle">Real-time performance metrics and agent analytics</p>
            {models.lastUpdated && (
              <p className="data-source-info">
                Last updated: {new Date(models.lastUpdated).toLocaleString()}
                {totalRequests > 0 && totalRequests < 1000 && (
                  <span className="mock-data-badge">⚠️ Using simulated data - Configure Sentry for real metrics</span>
                )}
              </p>
            )}
          </div>
          <div className="header-controls">
            <button
              onClick={() => navigate('/')}
              style={{
                marginRight: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              ← Return to Home
            </button>
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="time-range-select">
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <button
              onClick={() => navigate('/analytics/code')}
              style={{
                marginLeft: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              🐛 Code Issues & AI Errors
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-icon" style={{ backgroundColor: '#667eea20', color: '#667eea' }}>
              <ChartBarIcon className="icon" />
            </div>
            <div className="card-content">
              <div className="card-label">Total Requests</div>
              <div className="card-value">{totalRequests.toLocaleString()}</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="card-icon" style={{ backgroundColor: '#10b98120', color: '#10b981' }}>
              <CheckCircleIcon className="icon" />
            </div>
            <div className="card-content">
              <div className="card-label">Avg Success Rate</div>
              <div className="card-value">{avgSuccessRate.toFixed(1)}%</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="card-icon" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
              <XCircleIcon className="icon" />
            </div>
            <div className="card-content">
              <div className="card-label">Total Errors</div>
              <div className="card-value">{totalErrors}</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="card-icon" style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
              <ClockIcon className="icon" />
            </div>
            <div className="card-content">
              <div className="card-label">Avg Latency</div>
              <div className="card-value">{Math.round(avgLatency)}ms</div>
            </div>
          </div>
        </div>


        {/* Model Performance Table - moved above charts */}
        <div className="models-section" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
          <div className="chart-container full-width">
            <h3>Model Performance Details</h3>
            <div className="table-controls" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="tab-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
                  className={activeTab === 'text' ? 'active' : ''}
          onClick={() => setActiveTab('text')}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: activeTab === 'text' ? '#667eea' : 'white',
                    color: activeTab === 'text' ? 'white' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Text Models ({models.text.length})
        </button>
        <button 
                  className={activeTab === 'image' ? 'active' : ''}
          onClick={() => setActiveTab('image')}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: activeTab === 'image' ? '#667eea' : 'white',
                    color: activeTab === 'image' ? 'white' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Image Models ({models.image.length})
        </button>
      </div>
              <div className="sort-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                <label style={{ fontSize: '14px', color: '#6b7280' }}>Sort by:</label>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
            <option value="healthScore">Health Score</option>
            <option value="successRate">Success Rate</option>
            <option value="latency">Latency</option>
            <option value="errors">Error Count</option>
          </select>
          <button 
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
      <div className="metrics-grid">
        <table className="metrics-table">
          <thead>
            <tr>
              <th className="rank-col">Rank</th>
              <th className="sortable" onClick={() => handleSort('healthScore')}>
                Model {sortBy === 'healthScore' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>Model ID</th>
              <th className="sortable" onClick={() => handleSort('successRate')}>
                Success Rate {sortBy === 'successRate' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('latency')}>
                P95 Latency {sortBy === 'latency' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('errors')}>
                Errors {sortBy === 'errors' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>Requests</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {sortedModels.map((model, index) => (
              <React.Fragment key={model.id}>
                <tr 
                  className={`model-row ${expandedModel === model.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                >
                  <td className="rank-col">
                    <span className={`rank-number ${index === 0 ? 'rank-1' : ''} ${index === sortedModels.length - 1 ? 'rank-last' : ''}`}>
                      #{index + 1}
                    </span>
                  </td>
                  <td className="model-name-col">
                    <div className="model-info">
                      <span className={`status-icon ${model.status}`}>{model.statusIcon}</span>
                      <span className="model-name">{model.name}</span>
                    </div>
                  </td>
                  <td>
                    <span 
                      className="provider-badge" 
                      style={{ backgroundColor: getProviderBadgeColor(model.provider) }}
                    >
                      {model.id}
                    </span>
                  </td>
                  <td className="success-rate">
                    {model.successRate.toFixed(1)}%
                  </td>
                  <td className="latency">
                    {model.p95Latency.toFixed(0)}ms
                  </td>
                  <td>
                    <span className={`error-count ${model.errorCount === 0 ? 'low' : model.errorCount < 5 ? 'medium' : 'high'}`}>
                      {model.errorCount}
                    </span>
                  </td>
                  <td className="request-count">
                    {model.requestCount}
                  </td>
                  <td className="health-col">
                    <div className="health-score-wrapper">
                      <div className="health-score-bar" style={{ width: `${model.healthScore}%` }}>
                        <span className="health-score-text">{model.healthScore.toFixed(1)}</span>
                      </div>
                    </div>
                  </td>
                </tr>
                {expandedModel === model.id && (
                  <tr className="details-row">
                    <td colSpan="8">
                      <div className="model-details">
                        <div className="detail-section">
                          <h4>Model Information</h4>
                          <p><strong>ID:</strong> {model.id}</p>
                          <p><strong>Type:</strong> {model.type}</p>
                                <p><strong>Used By:</strong> {model.usedBy?.join(', ') || 'N/A'}</p>
                        </div>
                        <div className="detail-section">
                          <h4>Performance Metrics</h4>
                          <p><strong>Success Rate:</strong> {model.successRate.toFixed(2)}%</p>
                          <p><strong>P95 Latency:</strong> {model.p95Latency.toFixed(0)}ms</p>
                          <p><strong>Total Requests:</strong> {model.requestCount}</p>
                        </div>
                        {model.errors && model.errors.length > 0 && (
                          <div className="detail-section">
                            <h4>Recent Errors</h4>
                            <ul className="error-list">
                              {model.errors.slice(0, 3).map(err => (
                                <li key={err.id}>
                                  <strong>{err.title}</strong>
                                  <span className="error-meta">Count: {err.count} | Last seen: {new Date(err.lastSeen).toLocaleString()}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="charts-section">
          <div className="chart-container">
            <h3>P95 Latency by Model (ms)</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={latencyChartData} margin={{ top: 10, right: 20, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  tick={{ fontSize: 11, fill: '#374151' }}
                  interval={0}
                />
                <YAxis 
                  label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', style: { fontSize: '14px', fontWeight: 600 } }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  formatter={(value) => `${value.toLocaleString()} ms`}
                  contentStyle={{ fontSize: '13px', padding: '10px', borderRadius: '8px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="latency" fill="#667eea" name="P95 Latency" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <h3>Success Rate by Model (%)</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={successChartData.slice(0, 10)} margin={{ top: 10, right: 20, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  tick={{ fontSize: 11, fill: '#374151' }}
                  interval={0}
                />
                <YAxis 
                  domain={[0, 100]} 
                  label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft', style: { fontSize: '14px', fontWeight: 600 } }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  formatter={(value) => `${value.toFixed(1)}%`}
                  contentStyle={{ fontSize: '13px', padding: '10px', borderRadius: '8px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="success" fill="#10b981" name="Success Rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {timeSeriesData.length > 0 && (
            <div className="chart-container full-width">
              <h3>Student Feedback Metrics Over Time (%)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorClarity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#667eea" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#667eea" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#764ba2" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#764ba2" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f093fb" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#f093fb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12, fill: '#374151' }}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    label={{ value: 'Score (%)', angle: -90, position: 'insideLeft', style: { fontSize: '14px', fontWeight: 600 } }}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value) => `${value.toFixed(1)}%`}
                    contentStyle={{ fontSize: '13px', padding: '10px', borderRadius: '8px' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="clarity" stroke="#667eea" fillOpacity={1} fill="url(#colorClarity)" name="Clarity" />
                  <Area type="monotone" dataKey="engagement" stroke="#764ba2" fillOpacity={1} fill="url(#colorEngagement)" name="Engagement" />
                  <Area type="monotone" dataKey="confidence" stroke="#f093fb" fillOpacity={1} fill="url(#colorConfidence)" name="Confidence" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {agentPerfData.length > 0 && (
            <div className="chart-container full-width">
              <h3>Agent Performance by Feedback Score (%)</h3>
              <ResponsiveContainer width="100%" height={Math.max(350, agentPerfData.length * 45)}>
                <BarChart data={agentPerfData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    domain={[0, 100]} 
                    label={{ value: 'Score (%)', position: 'insideBottom', offset: -5, style: { fontSize: '14px', fontWeight: 600 } }}
                    tick={{ fontSize: 12, fill: '#374151' }}
                  />
                  <YAxis 
                    dataKey="agent" 
                    type="category" 
                    width={280}
                    tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                    interval={0}
                    angle={0}
                  />
                  <Tooltip 
                    formatter={(value, name) => [`${value.toFixed(1)}%`, name]}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0] && payload[0].payload.agentComboFull) {
                        return payload[0].payload.agentComboFull;
                      }
                      return label;
                    }}
                    contentStyle={{ fontSize: '13px', padding: '10px', borderRadius: '8px', maxWidth: '400px' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="square"
                  />
                  <Bar dataKey="clarity" stackId="a" fill="#667eea" name="Clarity" />
                  <Bar dataKey="engagement" stackId="a" fill="#764ba2" name="Engagement" />
                  <Bar dataKey="confidence" stackId="a" fill="#f093fb" name="Confidence" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {providerData.length > 0 && (
            <div className="chart-container">
              <h3>Model Count by Provider</h3>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={providerData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {providerData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name) => [value, name]}
                    contentStyle={{ fontSize: '13px', padding: '10px', borderRadius: '8px' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Model Performance Table - moved above charts */}
        <div className="models-section" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
          <div className="chart-container full-width">
            <h3>Model Performance Details</h3>
            <div className="table-controls" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="tab-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={activeTab === 'text' ? 'active' : ''}
                  onClick={() => setActiveTab('text')}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: activeTab === 'text' ? '#667eea' : 'white',
                    color: activeTab === 'text' ? 'white' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Text Models ({models.text.length})
                </button>
                <button
                  className={activeTab === 'image' ? 'active' : ''}
                  onClick={() => setActiveTab('image')}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: activeTab === 'image' ? '#667eea' : 'white',
                    color: activeTab === 'image' ? 'white' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Image Models ({models.image.length})
                </button>
              </div>
              <div className="sort-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                <label style={{ fontSize: '14px', color: '#6b7280' }}>Sort by:</label>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="healthScore">Health Score</option>
                  <option value="successRate">Success Rate</option>
                  <option value="latency">Latency</option>
                  <option value="errors">Error Count</option>
                </select>
                <button 
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
            <div className="metrics-grid">
              <table className="metrics-table">
            <thead>
              <tr>
                <th className="rank-col">Rank</th>
                <th className="sortable" onClick={() => handleSort('healthScore')}>
                  Model {sortBy === 'healthScore' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Model ID</th>
                <th className="sortable" onClick={() => handleSort('successRate')}>
                  Success Rate {sortBy === 'successRate' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="sortable" onClick={() => handleSort('latency')}>
                  P95 Latency {sortBy === 'latency' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="sortable" onClick={() => handleSort('errors')}>
                  Errors {sortBy === 'errors' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Requests</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((model, index) => (
                <React.Fragment key={model.id}>
                  <tr 
                    className={`model-row ${expandedModel === model.id ? 'expanded' : ''}`}
                    onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                  >
                    <td className="rank-col">
                      <span className={`rank-number ${index === 0 ? 'rank-1' : ''} ${index === sortedModels.length - 1 ? 'rank-last' : ''}`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="model-name-col">
                      <div className="model-info">
                        <span className={`status-icon ${model.status}`}>{model.statusIcon}</span>
                        <span className="model-name">{model.name}</span>
                      </div>
                    </td>
                    <td>
                      <span 
                        className="provider-badge" 
                        style={{ backgroundColor: getProviderBadgeColor(model.provider) }}
                      >
                        {model.id}
                      </span>
                    </td>
                    <td className="success-rate">
                      {model.successRate.toFixed(1)}%
                    </td>
                    <td className="latency">
                      {model.p95Latency.toFixed(0)}ms
                    </td>
                    <td>
                      <span className={`error-count ${model.errorCount === 0 ? 'low' : model.errorCount < 5 ? 'medium' : 'high'}`}>
                        {model.errorCount}
                      </span>
                    </td>
                    <td className="request-count">
                      {model.requestCount}
                    </td>
                    <td className="health-col">
                      <div className="health-score-wrapper">
                        <div className="health-score-bar" style={{ width: `${model.healthScore}%` }}>
                          <span className="health-score-text">{model.healthScore.toFixed(1)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {expandedModel === model.id && (
                    <tr className="details-row">
                      <td colSpan="8">
                        <div className="model-details">
                          <div className="detail-section">
                            <h4>Model Information</h4>
                            <p><strong>ID:</strong> {model.id}</p>
                            <p><strong>Type:</strong> {model.type}</p>
                            <p><strong>Used By:</strong> {model.usedBy?.join(', ') || 'N/A'}</p>
                          </div>
                          <div className="detail-section">
                            <h4>Performance Metrics</h4>
                            <p><strong>Success Rate:</strong> {model.successRate.toFixed(2)}%</p>
                            <p><strong>P95 Latency:</strong> {model.p95Latency.toFixed(0)}ms</p>
                            <p><strong>Total Requests:</strong> {model.requestCount}</p>
                          </div>
                          {model.errors && model.errors.length > 0 && (
                            <div className="detail-section">
                              <h4>Recent Errors</h4>
                              <ul className="error-list">
                                {model.errors.slice(0, 3).map(err => (
                                  <li key={err.id}>
                                    <strong>{err.title}</strong>
                                    <span className="error-meta">Count: {err.count} | Last seen: {new Date(err.lastSeen).toLocaleString()}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
