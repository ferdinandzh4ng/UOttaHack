import { useState, useEffect, useRef } from 'react';
import './TaskViewModal.css';

function TaskViewModal({ task, onClose }) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [isCollectingMetrics, setIsCollectingMetrics] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [metricsStatus, setMetricsStatus] = useState('idle'); // idle, starting, active, stopping
  const [quizAnswers, setQuizAnswers] = useState({}); // Store student answers
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTaskComplete, setIsTaskComplete] = useState(false);
  const [hasCheckedCompletion, setHasCheckedCompletion] = useState(false);
  
  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const userRef = useRef(null);
  const audioRef = useRef(null);
  
  if (!task) return null;

  // Get user role to determine if they can see variants
  const [userRole, setUserRole] = useState(null);
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const userObj = JSON.parse(userData);
      setUserRole(userObj.role);
    }
  }, []);

  // For students: use the task directly (it's already their assigned variant)
  // For educators: show variant selector if variants exist
  const isStudent = userRole === 'student';
  const hasVariants = !isStudent && task.variants && task.variants.length > 0;
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(hasVariants ? 0 : -1);
  
  const displayTask = hasVariants && selectedVariantIndex >= 0
    ? task.variants[selectedVariantIndex]
    : task;

  const isLesson = displayTask.type === 'Lesson';
  const slides = isLesson ? (displayTask.lessonData?.slides || []) : [];
  const currentSlide = slides[currentSlideIndex];
  const quizQuestions = !isLesson ? (displayTask.quizData?.questions || []) : [];

  // Track if last slide has been viewed (for lessons)
  const [lastSlideViewed, setLastSlideViewed] = useState(false);

  // Check if task is complete
  useEffect(() => {
    if (isStudent) {
      if (isLesson) {
        // Lesson is complete when last slide has been viewed
        setIsTaskComplete(slides.length > 0 && lastSlideViewed);
      } else {
        // Quiz is complete only after successful submission (not just when all answered)
        // Don't auto-complete - wait for explicit submission
        // isTaskComplete is set in handleQuizSubmit after successful API response
      }
    } else {
      // Educators can always close
      setIsTaskComplete(true);
    }
  }, [isStudent, isLesson, slides.length, lastSlideViewed, quizQuestions.length, quizAnswers, isSubmitting]);

  // Track when last slide is viewed
  useEffect(() => {
    if (isLesson && isStudent && slides.length > 0 && currentSlideIndex === slides.length - 1) {
      setLastSlideViewed(true);
    }
  }, [isLesson, isStudent, currentSlideIndex, slides.length]);

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
    } else {
      // Reached last slide - task is complete
      if (isStudent) {
        setIsTaskComplete(true);
      }
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

  // Check if quiz is already completed when modal opens (for students)
  useEffect(() => {
    const checkQuizCompletion = async () => {
      if (!isStudent || isLesson || hasCheckedCompletion || !userRef.current || (!displayTask.id && !displayTask._id)) {
        return;
      }

      try {
        const taskId = displayTask.id || displayTask._id;
        const response = await fetch(`/api/tasks/check-completion?taskId=${taskId}&studentId=${userRef.current.id}`);
        const data = await response.json();
        
        if (response.ok && data.completed) {
          // Quiz is already completed - close modal and show message
          alert('This quiz has already been completed.');
          handleClose();
          return;
        }
      } catch (error) {
        console.error('Error checking quiz completion:', error);
        // Don't block the user if check fails - let them try
      }
      
      setHasCheckedCompletion(true);
    };

    if (quizQuestions.length > 0) {
      checkQuizCompletion();
    }
  }, [isStudent, isLesson, displayTask.id, displayTask._id, hasCheckedCompletion, quizQuestions.length]);

  // Reset quiz state when task changes
  useEffect(() => {
    if (task && !isLesson) {
      // Reset quiz answers when opening a new quiz
      setQuizAnswers({});
      setIsTaskComplete(false);
      setIsSubmitting(false);
      setHasCheckedCompletion(false);
    }
  }, [task?.id, task?._id, isLesson]);

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

  // Update preview video when stream is available
  useEffect(() => {
    if (previewVideoRef.current && streamRef.current && isCollectingMetrics) {
      // Only set if not already set to avoid re-initialization
      if (previewVideoRef.current.srcObject !== streamRef.current) {
        previewVideoRef.current.srcObject = streamRef.current;
      }
      const playPromise = previewVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
            console.warn('[Preview Video] Play error:', error);
          }
        });
      }
    }
  }, [isCollectingMetrics, streamRef.current]);

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

    // Clear preview video
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
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
    // Prevent closing if task is not complete (for students)
    if (isStudent && !isTaskComplete) {
      if (isLesson) {
        alert('Please view all slides before closing.');
      } else {
        alert('Please answer all questions and submit the quiz before closing.');
      }
      return;
    }
    stopMetricsCollection();
    onClose();
  };

  const handleQuizAnswerChange = (questionIndex, value) => {
    // Prevent changes if already submitted or submitting
    if (isTaskComplete || isSubmitting) {
      return;
    }
    
    setQuizAnswers(prev => ({
      ...prev,
      [questionIndex]: value
    }));
  };

  const handleQuizSubmit = async () => {
    if (!userRef.current || userRef.current.role !== 'student') {
      return;
    }

    // Prevent double submission
    if (isSubmitting || isTaskComplete) {
      return;
    }

    // Check if all questions are answered
    const allAnswered = quizQuestions.every((q, idx) => {
      return quizAnswers[idx] !== undefined && quizAnswers[idx] !== '';
    });

    if (!allAnswered) {
      alert('Please answer all questions before submitting.');
      return;
    }

    // Double-check we have answers for all questions
    if (quizQuestions.length === 0) {
      alert('No questions available.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Submit quiz answers
      const response = await fetch('/api/tasks/submit-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: displayTask.id || displayTask._id,
          studentId: userRef.current.id,
          answers: quizQuestions.map((q, idx) => ({
            questionNumber: q.questionNumber || idx + 1,
            answer: quizAnswers[idx]
          }))
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setIsTaskComplete(true);
        // Close modal immediately after successful submission
        // The parent component will refresh the task list
        handleClose();
      } else {
        alert(`Error submitting quiz: ${data.error || 'Unknown error'}`);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Error submitting quiz. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="task-view-overlay" 
      onClick={(e) => {
        // Only allow closing if task is complete or user is educator
        if (isStudent && !isTaskComplete) {
          e.stopPropagation();
          return;
        }
        handleClose();
      }}
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

        {/* Visible webcam feed in corner - only for students when tracking */}
        {userRef.current?.role === 'student' && isCollectingMetrics && streamRef.current && (
          <div className="webcam-preview" style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '200px',
            height: '150px',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '2px solid #667eea',
            zIndex: 1001,
            backgroundColor: '#000'
          }}>
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => {
                if (previewVideoRef.current) {
                  previewVideoRef.current.play().catch(err => {
                    console.warn('Preview video play error:', err);
                  });
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)' // Mirror the video for natural selfie view
              }}
            />
            <div style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor: 'rgba(102, 126, 234, 0.9)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              pointerEvents: 'none'
            }}>
              <span>📹</span>
              <span>Recording</span>
            </div>
          </div>
        )}

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
            {/* Only show variant selector for educators */}
            {hasVariants && !isStudent && (
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
            {/* Show group info for students */}
            {isStudent && task.groupNumber && (
              <div className="group-info" style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Group {task.groupNumber}
              </div>
            )}
          </div>
          <button 
            className="close-btn" 
            onClick={handleClose}
            disabled={isStudent && !isTaskComplete}
            style={isStudent && !isTaskComplete ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            title={isStudent && !isTaskComplete ? 'Complete the task to close' : 'Close'}
          >
            ×
          </button>
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
                    
                    {/* Show answer input for students */}
                    {isStudent && (
                      <div className="answer-input" style={{ marginTop: '12px' }}>
                        {question.type === 'MCQ' ? (
                          question.options && question.options.length > 0 ? (
                            <div>
                              <label><strong>Select your answer:</strong></label>
                              <select
                                value={quizAnswers[index] || ''}
                                onChange={(e) => handleQuizAnswerChange(index, e.target.value)}
                                disabled={isTaskComplete || isSubmitting}
                                style={{ 
                                  width: '100%', 
                                  padding: '10px', 
                                  fontSize: '14px', 
                                  marginTop: '8px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  cursor: isTaskComplete || isSubmitting ? 'not-allowed' : 'pointer',
                                  opacity: isTaskComplete || isSubmitting ? 0.6 : 1,
                                  backgroundColor: isTaskComplete || isSubmitting ? '#f5f5f5' : 'white'
                                }}
                              >
                                <option value="">-- Select an answer --</option>
                                {question.options.map((option, optIndex) => (
                                  <option key={optIndex} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div style={{ padding: '8px', background: '#fff3cd', borderRadius: '4px', color: '#856404' }}>
                              <p>⚠️ No options available for this question. Please contact your teacher.</p>
                            </div>
                          )
                        ) : question.type === 'True/False' ? (
                          <div>
                            <label><strong>Select your answer:</strong></label>
                            <div style={{ marginTop: '8px', display: 'flex', gap: '20px' }}>
                              <label style={{ cursor: isTaskComplete || isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', fontSize: '16px', opacity: isTaskComplete || isSubmitting ? 0.6 : 1 }}>
                                <input
                                  type="radio"
                                  name={`question-${index}`}
                                  value="True"
                                  checked={quizAnswers[index] === 'True'}
                                  onChange={(e) => handleQuizAnswerChange(index, e.target.value)}
                                  disabled={isTaskComplete || isSubmitting}
                                  style={{ marginRight: '8px', width: '18px', height: '18px', cursor: isTaskComplete || isSubmitting ? 'not-allowed' : 'pointer' }}
                                />
                                True
                              </label>
                              <label style={{ cursor: isTaskComplete || isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', fontSize: '16px', opacity: isTaskComplete || isSubmitting ? 0.6 : 1 }}>
                                <input
                                  type="radio"
                                  name={`question-${index}`}
                                  value="False"
                                  checked={quizAnswers[index] === 'False'}
                                  onChange={(e) => handleQuizAnswerChange(index, e.target.value)}
                                  disabled={isTaskComplete || isSubmitting}
                                  style={{ marginRight: '8px', width: '18px', height: '18px', cursor: isTaskComplete || isSubmitting ? 'not-allowed' : 'pointer' }}
                                />
                                False
                              </label>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    
                    {/* Show options list for educators */}
                    {!isStudent && question.options && question.options.length > 0 && (
                      <div className="question-options" style={{ marginTop: '12px' }}>
                        <h4>Options:</h4>
                        <ul>
                          {question.options.map((option, optIndex) => (
                            <li key={optIndex}>{option}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* For Short Answer questions, show text input */}
                    {question.type === 'Short Answer' && isStudent && (
                      <div className="answer-input" style={{ marginTop: '12px' }}>
                        <label>
                          <strong>Your Answer:</strong>
                          <textarea
                            value={quizAnswers[index] || ''}
                            onChange={(e) => handleQuizAnswerChange(index, e.target.value)}
                            placeholder="Type your answer here..."
                            disabled={isTaskComplete || isSubmitting}
                            style={{ 
                              width: '100%', 
                              minHeight: '80px', 
                              padding: '8px', 
                              fontSize: '14px',
                              marginTop: '8px',
                              fontFamily: 'inherit',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              cursor: isTaskComplete || isSubmitting ? 'not-allowed' : 'text',
                              opacity: isTaskComplete || isSubmitting ? 0.6 : 1,
                              backgroundColor: isTaskComplete || isSubmitting ? '#f5f5f5' : 'white'
                            }}
                          />
                        </label>
                      </div>
                    )}
                    
                    {/* Show correct answer and explanation only for educators */}
                    {!isStudent && (
                      <>
                        <div className="question-answer" style={{ marginTop: '12px', padding: '8px', background: '#e8f5e9', borderRadius: '4px' }}>
                          <strong>Correct Answer:</strong> {question.correctAnswer}
                        </div>
                        
                        {question.explanation && (
                          <div className="question-explanation" style={{ marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                            <strong>Explanation:</strong> {question.explanation}
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Show student's answer if submitted */}
                    {isStudent && quizAnswers[index] && (
                      <div style={{ marginTop: '12px', padding: '8px', background: '#e3f2fd', borderRadius: '4px' }}>
                        <strong>Your Answer:</strong> {quizAnswers[index]}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Submit button for students */}
                {isStudent && (
                  <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    {(() => {
                      const allAnswered = quizQuestions.every((q, idx) => 
                        quizAnswers[idx] !== undefined && quizAnswers[idx] !== ''
                      );
                      const answeredCount = quizQuestions.filter((q, idx) => 
                        quizAnswers[idx] !== undefined && quizAnswers[idx] !== ''
                      ).length;
                      const isDisabled = isSubmitting || !allAnswered || isTaskComplete;
                      
                      return (
                        <>
                          {!allAnswered && (
                            <p style={{ 
                              marginBottom: '12px', 
                              color: '#666', 
                              fontSize: '14px' 
                            }}>
                              {answeredCount} of {quizQuestions.length} questions answered
                            </p>
                          )}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Only submit if button is enabled and not already complete
                              if (!isDisabled && !isTaskComplete && !isSubmitting) {
                                handleQuizSubmit();
                              }
                            }}
                            disabled={isDisabled}
                            style={{
                              padding: '12px 32px',
                              fontSize: '16px',
                              backgroundColor: isDisabled ? '#ccc' : '#4CAF50',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              opacity: isDisabled ? 0.6 : 1,
                              transition: 'opacity 0.2s',
                              minWidth: '150px'
                            }}
                          >
                            {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                          </button>
                          {isTaskComplete && (
                            <p style={{ 
                              marginTop: '12px', 
                              color: '#4CAF50', 
                              fontWeight: 'bold',
                              fontSize: '16px'
                            }}>
                              ✓ Quiz submitted successfully!
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
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

