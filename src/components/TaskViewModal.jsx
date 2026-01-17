import { useState } from 'react';
import './TaskViewModal.css';

function TaskViewModal({ task, onClose, userRole = 'student' }) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  
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
    if (e.key === 'Escape') onClose();
  };

  return (
    <div 
      className="task-view-overlay" 
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="task-view-content" onClick={(e) => e.stopPropagation()}>
        <div className="task-view-header">
          <div className="task-view-title-section">
            <h2>{task.topic}</h2>
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
          <button className="close-btn" onClick={onClose}>×</button>
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

                    {currentSlide?.speechUrl && currentSlide.speechUrl.trim() !== '' ? (
                      <div className="slide-speech">
                        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600', color: '#333' }}>Audio</h3>
                        <audio 
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

