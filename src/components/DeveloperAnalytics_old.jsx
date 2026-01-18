import React, { useState, useEffect } from 'react';
import './DeveloperAnalytics.css';

const DeveloperAnalytics = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [agentDetails, setAgentDetails] = useState({});
  const [countdown, setCountdown] = useState(45);
  const [sortBy, setSortBy] = useState('healthScore'); // healthScore, successRate, latency, errors
  const [sortOrder, setSortOrder] = useState('desc'); // desc (best to worst) or asc

  // Fetch metrics from API
  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/analytics/metrics');
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      setMetrics(data);
      setLoading(false);
      setError(null);
      setCountdown(45);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Fetch agent details when expanded
  const fetchAgentDetails = async (agentName) => {
    if (agentDetails[agentName]) return; // Already loaded
    
    try {
      const response = await fetch(`/api/analytics/agent/${agentName}/details`);
      if (!response.ok) throw new Error('Failed to fetch agent details');
      const data = await response.json();
      setAgentDetails(prev => ({ ...prev, [agentName]: data }));
    } catch (err) {
      console.error(`Error fetching details for ${agentName}:`, err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMetrics();
  }, []);

  // Auto-refresh every 45 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchMetrics();
    }, 45000);

    return () => clearInterval(intervalId);
  }, []);

  // Countdown timer
  useEffect(() => {
    const timerId = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return 45;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, []);

  // Toggle agent expansion
  const toggleAgentExpand = (agentName) => {
    if (expandedAgent === agentName) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentName);
      fetchAgentDetails(agentName);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'down': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // Get health color
  const getHealthColor = (score) => {
    if (score >= 90) return '#10b981';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  };

  // Sort agents based on selected criteria
  const getSortedAgents = (agents) => {
    if (!agents) return [];
    
    const sorted = [...agents].sort((a, b) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'healthScore':
          compareValue = (b.healthScore || 0) - (a.healthScore || 0);
          break;
        case 'successRate':
          compareValue = b.successRate - a.successRate;
          break;
        case 'latency':
          compareValue = a.p95Latency - b.p95Latency; // Lower is better
          break;
        case 'errors':
          compareValue = a.errorCount - b.errorCount; // Lower is better
          break;
        default:
          compareValue = 0;
      }
      
      return sortOrder === 'desc' ? compareValue : -compareValue;
    });
    
    return sorted;
  };

  // Handle sort change
  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      // Toggle sort order
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      // New sort field, default to desc (best to worst)
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
  };

  if (loading) {
    return (
      <div className="analytics-container">
        <div className="loading">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-container">
        <div className="error">
          Error loading analytics: {error}
          <button onClick={fetchMetrics} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const { systemHealth, agents, alerts } = metrics;
  const sortedAgents = getSortedAgents(agents);

  return (
    <div className="analytics-container">
      {/* Section 1: System Health Banner */}
      <div className="health-banner">
        <div className="health-left">
          <div className="pipeline-status">
            <div 
              className="status-indicator"
              style={{ 
                backgroundColor: getHealthColor(systemHealth.qualityScore)
              }}
            />
            <div>
              <div className="status-label">Learning Pipeline Status</div>
              <div className="status-value">
                {systemHealth.qualityScore >= 90 ? 'Operational' : 
                 systemHealth.qualityScore >= 70 ? 'Degraded' : 'Critical'}
              </div>
            </div>
          </div>
        </div>

        <div className="health-center">
          <div className="mini-card">
            <div className="mini-card-label">Agents Down</div>
            <div 
              className="mini-card-value"
              style={{ color: systemHealth.agentsDown > 0 ? '#ef4444' : '#10b981' }}
            >
              {systemHealth.agentsDown}
            </div>
          </div>

          <div className="mini-card">
            <div className="mini-card-label">Avg Latency</div>
            <div className="mini-card-value">
              {systemHealth.avgLatency}ms
              <span className="mini-card-trend">→</span>
            </div>
          </div>

          <div className="mini-card">
            <div className="mini-card-label">Unresolved Errors</div>
            <div 
              className="mini-card-value"
              style={{ color: systemHealth.criticalAlerts > 0 ? '#ef4444' : '#6b7280' }}
            >
              {systemHealth.criticalAlerts}
            </div>
          </div>
        </div>

        <div className="health-right">
          <div className="refresh-info">
            <div className="refresh-label">Last updated:</div>
            <div className="refresh-time">
              {new Date(metrics.lastUpdated).toLocaleTimeString()}
            </div>
            <div className="refresh-countdown">
              Refresh in {countdown}s
            </div>
          </div>
        </div>
      </div>

      {/* Critical Alerts Banner */}
      {alerts.filter(a => a.severity === 'critical').length > 0 && (
        <div className="critical-banner">
          <span className="critical-icon">🚨</span>
          <strong>URGENT:</strong> {alerts.filter(a => a.severity === 'critical')[0].message}
          <button className="dismiss-btn">Dismiss</button>
        </div>
      )}

      {/* Section 2: Agent Performance Grid */}
      <div className="agent-grid">
        <div className="grid-header">
          <h3>AI Agent Performance Ranking</h3>
          <div className="sort-controls">
            <label>Rank by:</label>
            <select 
              value={sortBy} 
              onChange={(e) => handleSort(e.target.value)}
              className="sort-select"
            >
              <option value="healthScore">Health Score</option>
              <option value="successRate">Success Rate</option>
              <option value="latency">Latency (Lower is Better)</option>
              <option value="errors">Errors (Lower is Better)</option>
            </select>
            <button 
              className="sort-order-btn"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            >
              {sortOrder === 'desc' ? '↓ Best to Worst' : '↑ Worst to Best'}
            </button>
          </div>
        </div>
        <table className="agent-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Agent</th>
              <th 
                className={`sortable ${sortBy === 'healthScore' ? 'active' : ''}`}
                onClick={() => handleSort('healthScore')}
              >
                Health Score {sortBy === 'healthScore' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                className={`sortable ${sortBy === 'successRate' ? 'active' : ''}`}
                onClick={() => handleSort('successRate')}
              >
                Success Rate {sortBy === 'successRate' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                className={`sortable ${sortBy === 'latency' ? 'active' : ''}`}
                onClick={() => handleSort('latency')}
              >
                P95 Latency {sortBy === 'latency' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                className={`sortable ${sortBy === 'errors' ? 'active' : ''}`}
                onClick={() => handleSort('errors')}
              >
                Errors (1h) {sortBy === 'errors' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th>Peer Rank</th>
              <th>Trending</th>
            </tr>
          </thead>
          <tbody>
            {sortedAgents.map((agent, index) => (
              <React.Fragment key={agent.name}>
                <tr 
                  className={`agent-row ${expandedAgent === agent.name ? 'expanded' : ''} ${agent.status === 'down' ? 'row-down' : ''}`}
                  onClick={() => toggleAgentExpand(agent.name)}
                >
                  <td>
                    <div className={`rank-number ${index === 0 ? 'rank-1' : index === sortedAgents.length - 1 ? 'rank-last' : ''}`}>
                      {index + 1}
                    </div>
                  </td>
                  <td>
                    <div 
                      className="status-dot"
                      style={{ backgroundColor: getStatusColor(agent.status) }}
                      title={agent.status}
                    />
                  </td>
                  <td>
                    <div className="agent-name">
                      <span className="agent-icon">{agent.icon}</span>
                      <div>
                        <div className="agent-display">{agent.display}</div>
                        <div className="agent-description">{agent.description}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="health-score-cell">
                      <div 
                        className="health-score-bar"
                        style={{ 
                          width: `${agent.healthScore || 0}%`,
                          backgroundColor: getHealthColor(agent.healthScore || 0)
                        }}
                      />
                      <span className="health-score-value">{Math.round(agent.healthScore || 0)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="metric-with-sparkline">
                      <span 
                        className="metric-value"
                        style={{ 
                          color: agent.successRate >= 95 ? '#10b981' : agent.successRate >= 85 ? '#f59e0b' : '#ef4444' 
                        }}
                      >
                        {agent.successRate.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="latency-metric">
                      <span 
                        className="metric-value"
                        style={{
                          color: agent.p95Latency < 2000 ? '#10b981' : agent.p95Latency < 4000 ? '#f59e0b' : '#ef4444'
                        }}
                      >
                        {Math.round(agent.p95Latency)}ms
                      </span>
                      {agent.latencyVsPeers && (
                        <span 
                          className="comparison-badge"
                          style={{ 
                            color: agent.latencyVsPeers > 1.2 ? '#f59e0b' : '#6b7280' 
                          }}
                        >
                          {agent.latencyVsPeers}x
                          {agent.latencyVsPeers > 1.2 ? ' ↑' : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span 
                      className={`error-count ${agent.errorCount > 10 ? 'high' : agent.errorCount > 5 ? 'medium' : 'low'}`}
                      style={{
                        color: agent.errorCount > 10 ? '#ef4444' : agent.errorCount > 5 ? '#f59e0b' : '#10b981'
                      }}
                    >
                      {agent.errorCount}
                      {agent.errorCount > 0 && agent.errors && agent.errors.length > 0 && ' 🚨'}
                    </span>
                  </td>
                  <td>
                    <span className={`peer-rank rank-${agent.peerRank.toLowerCase()}`}>
                      {agent.peerRank}
                    </span>
                  </td>
                  <td>
                    <span className="trending-arrow">{agent.trending}</span>
                  </td>
                </tr>

                {/* Expandable Details Row */}
                {expandedAgent === agent.name && (
                  <tr className="details-row">
                    <td colSpan="9">
                      <div className="details-content">
                        {agentDetails[agent.name] ? (
                          <>
                            <div className="details-section">
                              <h4>Recent Errors (Last 10)</h4>
                              <div className="error-list">
                                {agentDetails[agent.name].recentErrors.map((err, idx) => (
                                  <div key={idx} className="error-item">
                                    <div className="error-header">
                                      <span className="error-time">
                                        {new Date(err.timestamp).toLocaleTimeString()}
                                      </span>
                                      <span className="error-session">
                                        Session: {err.sessionId}
                                      </span>
                                      <span className="error-type">{err.errorType}</span>
                                    </div>
                                    <div className="error-message">{err.message}</div>
                                    <div className="breadcrumb-trail">
                                      {err.breadcrumbs.map((bc, bcIdx) => (
                                        <React.Fragment key={bcIdx}>
                                          <span className={`breadcrumb-item ${bc.type}`}>
                                            {bc.message}
                                          </span>
                                          {bcIdx < err.breadcrumbs.length - 1 && (
                                            <span className="breadcrumb-arrow">→</span>
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                    <div className="error-footer">
                                      <span>Affected students: {err.affectedStudents}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="details-section">
                              <h4>Latency Breakdown</h4>
                              <div className="latency-breakdown">
                                <div className="latency-bar-item">
                                  <span className="latency-label">Solace Publish</span>
                                  <div className="latency-bar">
                                    <div 
                                      className="latency-bar-fill solace"
                                      style={{ width: '20%' }}
                                    />
                                  </div>
                                  <span className="latency-value">
                                    {Math.round(agentDetails[agent.name].latencyBreakdown.solacePublish)}ms
                                  </span>
                                </div>
                                <div className="latency-bar-item">
                                  <span className="latency-label">AI Model Inference</span>
                                  <div className="latency-bar">
                                    <div 
                                      className="latency-bar-fill inference"
                                      style={{ width: '70%' }}
                                    />
                                  </div>
                                  <span className="latency-value">
                                    {Math.round(agentDetails[agent.name].latencyBreakdown.aiModelInference)}ms
                                  </span>
                                </div>
                                <div className="latency-bar-item">
                                  <span className="latency-label">Response Parse</span>
                                  <div className="latency-bar">
                                    <div 
                                      className="latency-bar-fill parse"
                                      style={{ width: '10%' }}
                                    />
                                  </div>
                                  <span className="latency-value">
                                    {Math.round(agentDetails[agent.name].latencyBreakdown.responseParse)}ms
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="details-actions">
                              <button className="action-btn primary">
                                View All in Sentry
                              </button>
                              <button className="action-btn secondary">
                                Copy Filter Query
                              </button>
                              <button className="action-btn secondary">
                                Export CSV
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="details-loading">Loading details...</div>
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
  );
};

export default DeveloperAnalytics;
