import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './DeveloperAnalytics.css';

export default function CodeIssues() {
  const navigate = useNavigate();
  const [issuesTab, setIssuesTab] = useState('ai-errors'); // 'ai-errors' or 'code-issues'
  const [debuggerData, setDebuggerData] = useState(null);
  const [loadingDebugger, setLoadingDebugger] = useState(false);
  const [allIssues, setAllIssues] = useState([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [issueDetails, setIssueDetails] = useState(null);
  const [loadingIssueDetails, setLoadingIssueDetails] = useState(false);

  useEffect(() => {
    if (issuesTab === 'ai-errors') {
      fetchDebugger();
    } else if (issuesTab === 'code-issues') {
      fetchAllIssues();
    }
  }, [issuesTab]);

  const fetchDebugger = async () => {
    try {
      setLoadingDebugger(true);
      const res = await fetch('/api/analytics/ai-debugger?limit=50');
      if (res.ok) {
        const data = await res.json();
        setDebuggerData(data);
      } else {
        console.warn('AI Debugger endpoint not available');
      }
    } catch (err) {
      console.warn('Failed to fetch AI debugger data:', err);
    } finally {
      setLoadingDebugger(false);
    }
  };

  const fetchAllIssues = async () => {
    try {
      setLoadingIssues(true);
      const res = await fetch('/api/analytics/issues?limit=50');
      if (res.ok) {
        const data = await res.json();
        setAllIssues(data.issues || []);
      } else {
        console.warn('Issues endpoint not available');
      }
    } catch (err) {
      console.warn('Failed to fetch issues:', err);
    } finally {
      setLoadingIssues(false);
    }
  };

  const fetchIssueDetails = async (issueId) => {
    try {
      setLoadingIssueDetails(true);
      const res = await fetch(`/api/analytics/issues/${issueId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedIssue(data.issue);
        setIssueDetails(data);
      }
    } catch (err) {
      console.warn('Failed to fetch issue details:', err);
    } finally {
      setLoadingIssueDetails(false);
    }
  };

  const IssueDetailModal = ({ issue, onClose, issueDetails, loadingDetails }) => {
    if (!issue) return null;

    const analysis = issueDetails?.analysis || null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Issue Details</h2>
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem',
                border: 'none',
                background: 'transparent',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ×
            </button>
          </div>

          {loadingDetails ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading details...</div>
          ) : (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                    {issue.shortId}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>{issue.title}</h3>
                  <span
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: issue.level === 'error' ? '#fee2e2' : issue.level === 'warning' ? '#fef3c7' : '#dbeafe',
                      color: issue.level === 'error' ? '#991b1b' : issue.level === 'warning' ? '#92400e' : '#1e40af'
                    }}
                  >
                    {issue.level?.toUpperCase() || 'ERROR'}
                  </span>
                </div>
                {issue.culprit && (
                  <p style={{ margin: '0.5rem 0', color: '#6b7280', fontSize: '14px' }}>{issue.culprit}</p>
                )}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '12px', color: '#9ca3af' }}>
                  <span>Events: {issue.count || 0}</span>
                  <span>Users: {issue.userCount || 0}</span>
                  <span>First seen: {new Date(issue.firstSeen).toLocaleString()}</span>
                  <span>Last seen: {new Date(issue.lastSeen).toLocaleString()}</span>
                </div>
              </div>

              {analysis && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '18px', fontWeight: 600 }}>Analysis</h4>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: '#374151', fontSize: '14px' }}>Root Cause:</strong>
                    <p style={{ margin: '0.5rem 0', color: '#6b7280', fontSize: '14px' }}>{analysis.rootCause}</p>
                  </div>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: '#374151', fontSize: '14px' }}>Impact:</strong>
                    <p style={{ margin: '0.5rem 0', color: '#6b7280', fontSize: '14px' }}>{analysis.impact}</p>
                  </div>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: '#374151', fontSize: '14px' }}>Fix Steps:</strong>
                    <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', color: '#6b7280', fontSize: '14px' }}>
                      {analysis.fixSteps && analysis.fixSteps.map((step, stepIdx) => (
                        <li key={stepIdx} style={{ marginBottom: '0.25rem' }}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: '#374151', fontSize: '14px' }}>Prevention:</strong>
                    <p style={{ margin: '0.5rem 0', color: '#6b7280', fontSize: '14px' }}>{analysis.prevention}</p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor:
                          analysis.priority === 'critical' ? '#fee2e2' :
                          analysis.priority === 'high' ? '#fef3c7' :
                          analysis.priority === 'medium' ? '#dbeafe' : '#f3f4f6',
                        color:
                          analysis.priority === 'critical' ? '#991b1b' :
                          analysis.priority === 'high' ? '#92400e' :
                          analysis.priority === 'medium' ? '#1e40af' : '#374151'
                      }}
                    >
                      Priority: {analysis.priority?.toUpperCase() || 'MEDIUM'}
                    </span>
                    {analysis.confidence !== undefined && (
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        Confidence: {Math.round(analysis.confidence * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              )}

              {issue.permalink && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                  <a
                    href={issue.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#667eea',
                      color: 'white',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 500
                    }}
                  >
                    View in Sentry →
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h1>Code Issues & AI Errors</h1>
        <div className="header-controls">
          <button onClick={() => navigate('/analytics')} className="return-home-button">
            ← Analytics Dashboard
          </button>
          <button onClick={() => navigate('/')} className="return-home-button">
            ← Return to Home
          </button>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="issues-tabs-section" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
        <div className="tab-buttons" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            className={`tab-button ${issuesTab === 'ai-errors' ? 'active' : ''}`}
            onClick={() => setIssuesTab('ai-errors')}
          >
            🤖 AI Errors {loadingDebugger && <span className="loading-spinner"></span>}
          </button>
          <button
            className={`tab-button ${issuesTab === 'code-issues' ? 'active' : ''}`}
            onClick={() => setIssuesTab('code-issues')}
          >
            🐛 Code Issues {loadingIssues && <span className="loading-spinner"></span>}
          </button>
        </div>

        {/* AI Errors Tab */}
        {issuesTab === 'ai-errors' && (
          <div className="chart-container full-width">
            <h3>AI Error Debugger</h3>
            {loadingDebugger ? (
              <div className="loading-message">Analyzing AI errors...</div>
            ) : debuggerData && debuggerData.analyzed && debuggerData.analyzed.length > 0 ? (
              <div className="debugger-errors">
                {debuggerData.analyzed.map((error) => (
                  <div key={error.issueId} className="debugger-error-card" onClick={() => fetchIssueDetails(error.issueId)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{error.title}</h4>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              backgroundColor:
                                error.analysis.priority === 'critical' ? '#fee2e2' :
                                error.analysis.priority === 'high' ? '#fef3c7' :
                                error.analysis.priority === 'medium' ? '#dbeafe' : '#f3f4f6',
                              color:
                                error.analysis.priority === 'critical' ? '#991b1b' :
                                error.analysis.priority === 'high' ? '#92400e' :
                                error.analysis.priority === 'medium' ? '#1e40af' : '#374151'
                            }}
                          >
                            {error.analysis.priority.toUpperCase()}
                          </span>
                        </div>
                        <p style={{ margin: '0.25rem 0', color: '#6b7280', fontSize: '14px' }}>{error.message}</p>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '12px', color: '#9ca3af' }}>
                          <span>Agent: {error.agent}</span>
                          <span>Provider: {error.provider}</span>
                          <span>Model: {error.model}</span>
                          <span>Count: {error.errorCount}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#667eea' }}>
                      Click to view details →
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data-message">No recent AI agent errors found. Great job! 🎉</p>
            )}
          </div>
        )}

        {/* Code Issues Tab */}
        {issuesTab === 'code-issues' && (
          <div className="chart-container full-width">
            <h3>All Sentry Code Issues</h3>
            {loadingIssues ? (
              <div className="loading-message">Fetching code issues...</div>
            ) : allIssues && allIssues.length > 0 ? (
              <div className="sentry-issues-list">
                {allIssues.map((issue) => (
                  <div key={issue.id} className="sentry-issue-card" onClick={() => fetchIssueDetails(issue.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                            {issue.shortId}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{issue.title}</h4>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: issue.level === 'error' ? '#fee2e2' : issue.level === 'warning' ? '#fef3c7' : '#dbeafe',
                              color: issue.level === 'error' ? '#991b1b' : issue.level === 'warning' ? '#92400e' : '#1e40af'
                            }}
                          >
                            {issue.level?.toUpperCase() || 'ERROR'}
                          </span>
                        </div>
                        {issue.culprit && (
                          <p style={{ margin: '0.25rem 0', color: '#6b7280', fontSize: '14px' }}>{issue.culprit}</p>
                        )}
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '12px', color: '#9ca3af' }}>
                          <span>Events: {issue.count || 0}</span>
                          <span>Users: {issue.userCount || 0}</span>
                          <span>Last seen: {new Date(issue.lastSeen).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#667eea' }}>
                      Click to view details →
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data-message">No recent code issues found. Keep up the good work! 👍</p>
            )}
          </div>
        )}
      </div>

      {/* Issue Detail Modal */}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => {
            setSelectedIssue(null);
            setIssueDetails(null);
          }}
          fetchIssueDetails={fetchIssueDetails}
          loadingDetails={loadingIssueDetails}
          issueDetails={issueDetails}
        />
      )}
    </div>
  );
}

