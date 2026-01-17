import { useState } from 'react';
import './CreateTaskModal.css';

function CreateTaskModal({ classId, onClose, onSuccess }) {
  const [type, setType] = useState('Lesson');
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState('');
  const [questionType, setQuestionType] = useState('MCQ');
  const [numQuestions, setNumQuestions] = useState('5');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!topic) {
      setError('Please enter a topic');
      return;
    }

    if (type === 'Lesson') {
      const lengthNum = parseInt(length);
      if (!length || isNaN(lengthNum) || lengthNum < 1) {
        setError('Length must be a positive number (minimum 1 minute)');
        return;
      }
    }

    if (type === 'Quiz') {
      const numQuestionsNum = parseInt(numQuestions);
      if (!numQuestions || isNaN(numQuestionsNum) || numQuestionsNum < 1 || numQuestionsNum > 50) {
        setError('Number of questions must be between 1 and 50');
        return;
      }
    }

    setLoading(true);

    try {
      const requestBody = {
        type,
        topic,
        classId
      };

      if (type === 'Lesson') {
        requestBody.length = parseInt(length);
      } else if (type === 'Quiz') {
        requestBody.questionType = questionType;
        requestBody.numQuestions = parseInt(numQuestions);
      }

      const response = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create task');
      }

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Task</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="type">Task Type</label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            >
              <option value="Lesson">Lesson (Slideshow)</option>
              <option value="Quiz">Quiz</option>
            </select>
            <small className="form-hint">
              {type === 'Lesson' 
                ? 'AI-generated slideshow with script, images, and speech'
                : 'AI-generated quiz with questions and answers'}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="topic">Topic</label>
            <input
              type="text"
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
              placeholder="e.g., Introduction to Algebra, World War II, Photosynthesis"
            />
          </div>

          {type === 'Lesson' && (
            <div className="form-group">
              <label htmlFor="length">Length (Minutes)</label>
              <input
                type="number"
                id="length"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                required
                min="1"
                placeholder="e.g., 5, 10, 15"
              />
              <small className="form-hint">
                The lesson will be divided into slides (approximately 2 minutes per slide)
              </small>
            </div>
          )}

          {type === 'Quiz' && (
            <>
              <div className="form-group">
                <label htmlFor="questionType">Question Type</label>
                <select
                  id="questionType"
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value)}
                  required
                >
                  <option value="MCQ">Multiple Choice (MCQ)</option>
                  <option value="True/False">True/False</option>
                  <option value="Short Answer">Short Answer</option>
                  <option value="Mixed">Mixed (All Types)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="numQuestions">Number of Questions</label>
                <input
                  type="number"
                  id="numQuestions"
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(e.target.value)}
                  required
                  min="1"
                  max="50"
                  placeholder="e.g., 5, 10, 20"
                />
              </div>
            </>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTaskModal;

