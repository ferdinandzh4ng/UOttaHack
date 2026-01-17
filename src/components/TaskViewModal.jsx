import { useState, useEffect, useRef } from 'react';
import './TaskViewModal.css';

function TaskViewModal({ task, onClose }) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [isCollectingMetrics, setIsCollectingMetrics] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [metricsStatus, setMetricsStatus] = useState('idle'); // idle, starting, active, stopping
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const userRef = useRef(null);
  const audioRef = useRef(null);
  
  if (!task) return null;

  // Determine which task data to display
  const hasVariants = task.variants && task.variants.length > 0;
  // Default to first variant if variants exist, otherwise use the task itself
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(hasVariants ? 0 : -1);
  
  const displayTask = hasVariants && selectedVariantIndex >= 0
    ? task.variants[selectedVariantIndex]
    : task;

  const isLesson = displayTask.type === 'Lesson';
  const slides = isLesson ? (displayTask.lessonData?.slides || []) : [];
  const currentSlide = slides[currentSlideIndex];

  // Debug logging
  console.log('[TaskViewModal] Display task:', displayTask);
  console.log('[TaskViewModal] Task type:', displayTask.type);
  console.log('[TaskViewModal] Quiz data:', displayTask.quizData);
  console.log('[TaskViewModal] Quiz questions:', displayTask.quizData?.questions);
  console.log('[TaskViewModal] Quiz questions length:', displayTask.quizData?.questions?.length);
  console.log('[TaskViewModal] Slides:', slides);
  console.log('[TaskViewModal] Current slide:', currentSlide);
  console.log('[TaskViewModal] Current slide speechUrl:', currentSlide?.speechUrl);

  // Get AI model labels
  const getAIModelLabel = (variant) => {
    if (!variant || !variant.aiModels) return 'Unknown Models';
    
    const formatModelName = (modelObj) => {
      if (!modelObj) return 'Unknown';
      if (modelObj.name) return modelObj.name;
      if (modelObj.model) {
        // Format model string (e.g., "openai/gpt-4" -> "GPT-4")
        const parts = modelObj.model.split('/');
        const modelPart = parts[parts.length - 1];
        return modelPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      return 'Unknown';
    };
    
    if (variant.type === 'Lesson') {
      const scriptModel = variant.aiModels.scriptModel;
      const imageModel = variant.aiModels.imageModel;
      const scriptLabel = formatModelName(scriptModel);
      const imageLabel = formatModelName(imageModel);
      return `Script: ${scriptLabel} | Image: ${imageLabel}`;
    } else {
      const promptModel = variant.aiModels.quizPromptModel;
      const questionsModel = variant.aiModels.quizQuestionsModel;
      const promptLabel = formatModelName(promptModel);
      const questionsLabel = formatModelName(questionsModel);
      return `Prompt: ${promptLabel} | Questions: ${questionsLabel}`;
    }
  };

  // Pause and reset audio when slide changes
  useEffect(() => {
    if (audioRef.current) {
      // Pause any currently playing audio
      const audio = audioRef.current;
      if (audio) {
        // Pause and reset, handling any play() promises
        const pausePromise = audio.pause();
        if (pausePromise !== undefined) {
          pausePromise.catch(() => {
            // Ignore pause errors
          });
        }
        audio.currentTime = 0;
        // Load the new source
        if (currentSlide?.speechUrl) {
          audio.load(); // This will reload with the new src
        }
      }
    }
  }, [currentSlideIndex, currentSlide?.speechUrl]);

  const handlePrevious = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') handlePrevious();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  // Get user from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      userRef.current = JSON.parse(userData);
    }
  }, []);

  // Start metrics collection when modal opens
  useEffect(() => {
    if (task && userRef.current && userRef.current.role === 'student') {
      startMetricsCollection();
    }

    return () => {
      // Cleanup on unmount
      stopMetricsCollection();
    };
  }, [task]);

  const startMetricsCollection = async () => {
    if (!userRef.current || userRef.current.role !== 'student') {
      return; // Only collect metrics for students
    }

    try {
      setMetricsStatus('starting');
      setCameraError(null);

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            // Ignore interruption errors
            if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
              console.warn('[Video] Play error:', error);
            }
          });
        }
      }

      // Start session with backend
      const response = await fetch('/api/metrics/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId: userRef.current.id,
          taskId: task.id || task._id
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start metrics session');
      }

      setSessionId(data.sessionId);
      setIsCollectingMetrics(true);
      setMetricsStatus('active');

      // Start capturing frames (every 1 second = 1 FPS for vitals)
      frameIntervalRef.current = setInterval(() => {
        captureAndSendFrame(data.sessionId);
      }, 1000); // 1 FPS is sufficient for vitals

    } catch (error) {
      console.error('[TaskViewModal] Error starting metrics collection:', error);
      setCameraError(error.message);
      setMetricsStatus('idle');
      
      // Stop stream if it was started
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const captureAndSendFrame = async (sessionIdToUse) => {
    if (!videoRef.current || !canvasRef.current || !sessionIdToUse) {
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Reduce canvas size for smaller payload (vitals don't need full resolution)
      // Use 640x480 max, which is sufficient for vitals detection
      const maxWidth = 640;
      const maxHeight = 480;
      const videoWidth = video.videoWidth || 1280;
      const videoHeight = video.videoHeight || 720;
      
      // Calculate scaled dimensions maintaining aspect ratio
      let canvasWidth = videoWidth;
      let canvasHeight = videoHeight;
      
      if (videoWidth > maxWidth || videoHeight > maxHeight) {
        const scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
        canvasWidth = Math.floor(videoWidth * scale);
        canvasHeight = Math.floor(videoHeight * scale);
      }

      // Set canvas size to scaled dimensions
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Draw current video frame to canvas (scaled)
      ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

      // Convert canvas to base64 with lower quality for smaller payload
      // Quality 0.5 should keep file size under 50KB for 640x480
      const frameData = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

      // Send frame to backend
      const response = await fetch('/api/metrics/frame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionIdToUse,
          frameData: frameData,
          timestamp: Date.now()
        }),
      });

      // Log metrics in real-time for testing
      if (response.ok) {
        const data = await response.json();
        if (data.metrics) {
          const m = data.metrics;
          const hr = m.heart_rate !== null && m.heart_rate !== undefined ? m.heart_rate : (m.heartRate !== null && m.heartRate !== undefined ? m.heartRate : null);
          const br = m.breathing_rate !== null && m.breathing_rate !== undefined ? m.breathing_rate : (m.breathingRate !== null && m.breathingRate !== undefined ? m.breathingRate : null);
          const focus = m.focus_score !== null && m.focus_score !== undefined ? m.focus_score : (m.focusScore !== null && m.focusScore !== undefined ? m.focusScore : 0);
          const engagement = m.engagement_score !== null && m.engagement_score !== undefined ? m.engagement_score : (m.engagementScore !== null && m.engagementScore !== undefined ? m.engagementScore : 0);
          const thinking = m.thinking_intensity !== null && m.thinking_intensity !== undefined ? m.thinking_intensity : (m.thinkingIntensity !== null && m.thinkingIntensity !== undefined ? m.thinkingIntensity : 0);
          
          console.log('📊 [METRICS]', {
            heartRate: hr !== null ? `${hr.toFixed(1)} BPM` : 'N/A',
            breathingRate: br !== null ? `${br.toFixed(1)} BPM` : 'N/A',
            focus: `${focus.toFixed(1)}/100`,
            engagement: `${engagement.toFixed(1)}/100`,
            thinking: `${thinking.toFixed(1)}/100`,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }
    } catch (error) {
      console.error('[TaskViewModal] Error sending frame:', error);
      // Don't stop collection on individual frame errors
    }
  };

  const stopMetricsCollection = async () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (sessionId && metricsStatus === 'active') {
      try {
        setMetricsStatus('stopping');
        await fetch('/api/metrics/session/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId
          }),
        });
        setMetricsStatus('idle');
      } catch (error) {
        console.error('[TaskViewModal] Error stopping metrics collection:', error);
      }
    }

    setIsCollectingMetrics(false);
    setSessionId(null);
  };

  const handleClose = () => {
    stopMetricsCollection();
    onClose();
  };

  return (
    <div 
      className="task-view-overlay" 
      onClick={handleClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="task-view-content" onClick={(e) => e.stopPropagation()}>
        {/* Hidden video element for camera capture */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ display: 'none' }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="task-view-header">
          <div className="task-view-title-section">
            <h2>{task.topic}</h2>
            {/* Metrics collection status */}
            {userRef.current?.role === 'student' && (
              <div className="metrics-status" style={{ 
                fontSize: '12px', 
                color: metricsStatus === 'active' ? '#28a745' : '#666',
                marginTop: '4px'
              }}>
                {metricsStatus === 'starting' && 'Starting metrics collection...'}
                {metricsStatus === 'active' && '📊 Collecting metrics'}
                {metricsStatus === 'stopping' && 'Stopping metrics collection...'}
                {cameraError && `⚠️ ${cameraError}`}
              </div>
            )}
            {hasVariants && (
              <div className="variant-selector">
                <label htmlFor="variant-select">Variant:</label>
                <select
                  id="variant-select"
                  value={selectedVariantIndex}
                  onChange={(e) => {
                    setSelectedVariantIndex(Number(e.target.value));
                    setCurrentSlideIndex(0); // Reset slide index when switching variants
                  }}
                  className="variant-select"
                >
                  {task.variants.map((variant, index) => (
                    <option key={variant.id} value={index}>
                      Variant {index + 1} - {getAIModelLabel(variant)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        {/* Show AI models info */}
        {displayTask.aiModels && (
          <div className="ai-models-info">
            <p><strong>AI Models Used:</strong> {getAIModelLabel(displayTask)}</p>
          </div>
        )}

        {isLesson ? (
          <div className="lesson-view">
            {slides.length === 0 ? (
              <div className="no-slides">
                <p>No slides available yet.</p>
                <p className="status-info">
                  Status: {displayTask.lessonData?.status || 'pending'}
                </p>
              </div>
            ) : (
              <>
                <div className="slide-container">
                  <div className="slide-number">
                    Slide {currentSlideIndex + 1} of {slides.length}
                  </div>
                  
                  <div className="slide-content">
                    {currentSlide?.imageUrl && currentSlide.imageUrl.trim() !== '' ? (
                      <div className="slide-image">
                        <img 
                          src={currentSlide.imageUrl} 
                          alt={`Slide ${currentSlide.slideNumber}`}
                          onError={(e) => {
                            console.error('[Image] Error loading image:', currentSlide.imageUrl, e);
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'block';
                            }
                          }}
                          onLoad={() => {
                            console.log('[Image] Image loaded successfully:', currentSlide.imageUrl);
                          }}
                        />
                        <div className="image-error" style={{ display: 'none' }}>
                          <p>Image could not be loaded</p>
                          <p style={{ fontSize: '12px', marginTop: '4px' }}>URL: {currentSlide.imageUrl}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="slide-image" style={{ padding: '12px', background: '#fff3cd', borderRadius: '4px', fontSize: '14px', color: '#856404' }}>
                        <p>No image available for this slide</p>
                        <p style={{ fontSize: '12px', marginTop: '4px' }}>imageUrl: {currentSlide?.imageUrl || 'undefined'}</p>
                      </div>
                    )}
                    
                    <div className="slide-script">
                      <h3>Script</h3>
                      <p>{currentSlide?.script || 'No script available'}</p>
                    </div>

                    {currentSlide?.speechUrl && currentSlide.speechUrl.trim() !== '' ? (
                      <div className="slide-speech">
                        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600', color: '#333' }}>Audio</h3>
                        <audio 
                          ref={audioRef}
                          controls 
                          src={currentSlide.speechUrl}
                          crossOrigin="anonymous"
                          preload="metadata"
                          style={{
                            width: '100%',
                            height: '54px',
                            marginBottom: '8px',
                            display: 'block'
                          }}
                          onError={(e) => {
                            console.error('[Audio] Error loading audio:', currentSlide.speechUrl, e);
                            console.error('[Audio] Error details:', e.target.error);
                            // Show error message but keep the audio element visible
                            const errorMsg = e.target.nextElementSibling;
                            if (errorMsg) {
                              errorMsg.style.display = 'block';
                              errorMsg.textContent = `Error loading audio: ${e.target.error?.message || 'Unknown error'}. URL: ${currentSlide.speechUrl}`;
                            }
                          }}
                          onLoadStart={() => {
                            console.log('[Audio] Loading audio from:', currentSlide.speechUrl);
                          }}
                          onCanPlay={() => {
                            console.log('[Audio] Audio can play:', currentSlide.speechUrl);
                          }}
                          onLoadedMetadata={(e) => {
                            console.log('[Audio] Metadata loaded, duration:', e.target.duration);
                          }}
                          onPlay={(e) => {
                            // Handle play() promise to avoid interruption warnings
                            const playPromise = e.target.play();
                            if (playPromise !== undefined) {
                              playPromise.catch(error => {
                                // Ignore interruption errors (DOMException: The play() request was interrupted)
                                if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                                  console.warn('[Audio] Play error:', error);
                                }
                              });
                            }
                          }}
                        >
                          Your browser does not support the audio element.
                        </audio>
                        <div className="audio-error" style={{ display: 'none', padding: '8px', background: '#fee', borderRadius: '4px', fontSize: '12px', color: '#c00', marginTop: '4px' }}></div>
                        <p className="audio-url-hint">
                          Direct link: <a href={currentSlide.speechUrl} target="_blank" rel="noopener noreferrer">{currentSlide.speechUrl}</a>
                        </p>
                      </div>
                    ) : (
                      <div className="slide-speech" style={{ padding: '12px', background: '#fff3cd', borderRadius: '4px', fontSize: '14px', color: '#856404' }}>
                        <p>No audio available for this slide</p>
                        <p style={{ fontSize: '12px', marginTop: '4px' }}>speechUrl: {currentSlide?.speechUrl || 'undefined'}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="slide-navigation">
                  <button 
                    className="nav-btn prev-btn" 
                    onClick={handlePrevious}
                    disabled={currentSlideIndex === 0}
                  >
                    ← Previous
                  </button>
                  
                  <div className="slide-indicators">
                    {slides.map((_, index) => (
                      <button
                        key={index}
                        className={`indicator ${index === currentSlideIndex ? 'active' : ''}`}
                        onClick={() => setCurrentSlideIndex(index)}
                        aria-label={`Go to slide ${index + 1}`}
                      />
                    ))}
                  </div>

                  <button 
                    className="nav-btn next-btn" 
                    onClick={handleNext}
                    disabled={currentSlideIndex === slides.length - 1}
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="quiz-view">
            <div className="quiz-info">
              <p><strong>Question Type:</strong> {displayTask.quizData?.questionType || 'N/A'}</p>
              <p><strong>Number of Questions:</strong> {displayTask.quizData?.numQuestions || 0}</p>
              <p><strong>Status:</strong> {displayTask.quizData?.status || 'pending'}</p>
            </div>

            {displayTask.quizData?.questions && displayTask.quizData.questions.length > 0 ? (
              <div className="quiz-questions">
                {displayTask.quizData.questions.map((question, index) => (
                  <div key={index} className="question-card">
                    <h3>Question {question.questionNumber || index + 1}</h3>
                    <p className="question-text">{question.question}</p>
                    <p className="question-type">Type: {question.type}</p>
                    
                    {question.options && question.options.length > 0 && (
                      <div className="question-options">
                        <h4>Options:</h4>
                        <ul>
                          {question.options.map((option, optIndex) => (
                            <li key={optIndex}>{option}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div className="question-answer">
                      <strong>Correct Answer:</strong> {question.correctAnswer}
                    </div>
                    
                    {question.explanation && (
                      <div className="question-explanation">
                        <strong>Explanation:</strong> {question.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-questions">
                <p>No questions available yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskViewModal;

