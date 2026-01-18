import React, { useEffect, useState } from 'react';
import './DeveloperAnalytics.css';

export default function DeveloperAnalytics() {
  const [models, setModels] = useState({ text: [], image: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('healthScore');
  const [sortOrder, setSortOrder] = useState('desc');
  const [activeTab, setActiveTab] = useState('text'); // 'text' or 'image'
  const [expandedModel, setExpandedModel] = useState(null);

  useEffect(() => {
    fetchModelMetrics();
    const interval = setInterval(fetchModelMetrics, 45000);
    return () => clearInterval(interval);
  }, []);

  const fetchModelMetrics = async () => {
    try {
      const response = await fetch('/api/analytics/models');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setModels(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch model metrics:', err);
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

  if (loading) {
    return (
      <div className="developer-analytics">
        <div className="loading">Loading model metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="developer-analytics">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  const currentModels = activeTab === 'text' ? models.text : models.image;
  const sortedModels = getSortedModels(currentModels);

  return (
    <div className="developer-analytics">
      <div className="analytics-container">
        <div className="analytics-header">
          <div>
            <h1>AI Model Performance</h1>
            <p className="subtitle">Real-time performance metrics for all AI models</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          Text Generation Models ({models.text.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'image' ? 'active' : ''}`}
          onClick={() => setActiveTab('image')}
        >
          Image Generation Models ({models.image.length})
        </button>
      </div>

      {/* Sort Controls */}
      <div className="grid-header">
        <div className="sort-controls">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="healthScore">Health Score</option>
            <option value="successRate">Success Rate</option>
            <option value="latency">Latency</option>
            <option value="errors">Error Count</option>
          </select>
          <button 
            className="sort-order-btn"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Model Performance Table */}
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
                          <p><strong>Used By:</strong> {model.usedBy.join(', ')}</p>
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
  );
}
