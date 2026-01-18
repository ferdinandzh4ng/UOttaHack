"""
Vitals Service - Presage SmartSpectra SDK Integration
This service processes video frames and returns vital signs metrics.
"""

import os
import math
import sys
import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import subprocess
import json
import tempfile
import threading
import time
import shutil
from collections import deque

# Import custom metrics processor for fallback
try:
    from custom_metrics_processor import CustomMetricsProcessor
    CUSTOM_METRICS_AVAILABLE = True
    print("✅ [INIT] Custom metrics processor imported successfully")
except ImportError as e:
    print(f"⚠️ [INIT] Warning: Custom metrics processor not available: {e}")
    print("  Falling back to Presage SDK only. Install mediapipe and scipy for custom metrics.")
    print("  Run: pip install mediapipe scipy")
    CUSTOM_METRICS_AVAILABLE = False
    CustomMetricsProcessor = None
except Exception as e:
    print(f"⚠️ [INIT] Error importing custom metrics processor: {e}")
    import traceback
    traceback.print_exc()
    CUSTOM_METRICS_AVAILABLE = False
    CustomMetricsProcessor = None

# Try to import numpy, fallback if not available
try:
    import numpy as np
except ImportError:
    print("Warning: numpy not available. Some features may not work.")
    np = None

app = Flask(__name__)
CORS(app)

# Configuration
PRESAGE_API_KEY = os.getenv('PRESAGE_API_KEY', '')
VITALS_SERVICE_PORT = int(os.getenv('VITALS_SERVICE_PORT', 5002))

# Session management
sessions = {}
session_lock = threading.Lock()

# Metrics calculation parameters
FOCUS_HEART_RATE_MIN = 60  # BPM
FOCUS_HEART_RATE_MAX = 100  # BPM
FOCUS_BREATHING_STABILITY_THRESHOLD = 2.0  # Standard deviation
THINKING_BREATHING_SLOW_THRESHOLD = 12  # BPM (slower breathing indicates thinking)
THINKING_HEART_RATE_INCREASE = 10  # BPM increase from baseline


class VitalsSession:
    """Manages a vitals collection session"""
    
    def __init__(self, session_id, api_key):
        self.session_id = session_id
        self.api_key = api_key
        self.start_time = datetime.now()
        self.metrics_history = deque(maxlen=100)  # Keep last 100 readings
        self.heart_rates = deque(maxlen=30)
        self.breathing_rates = deque(maxlen=30)
        self.baseline_heart_rate = None
        self.baseline_breathing_rate = None
        self.frame_count = 0
        
        # Eye tracking metrics
        self.gaze_directions = deque(maxlen=100)
        self.blink_rates = deque(maxlen=100)
        self.eye_movement_stabilities = deque(maxlen=100)
        self.focus_durations = deque(maxlen=100)
        
        # Initialize custom metrics processor for fallback
        self.custom_processor = None
        if CUSTOM_METRICS_AVAILABLE and CustomMetricsProcessor:
            try:
                self.custom_processor = CustomMetricsProcessor(fps=30)
                print(f"✅ [SESSION] Custom metrics processor initialized for session: {session_id[:20]}...")
            except Exception as e:
                print(f"⚠️ [SESSION] Failed to initialize custom metrics processor: {e}")
                self.custom_processor = None
        
    def add_metrics(self, heart_rate, breathing_rate, gaze_direction='unknown', blink_rate=None, eye_movement_stability=0.0, focus_duration=0.0):
        """
        Add new metrics reading with eye tracking data.
        
        Args:
            heart_rate: Heart rate in BPM
            breathing_rate: Breathing rate in BPM
            gaze_direction: Direction of gaze ('screen', 'away', 'unknown')
            blink_rate: Blinks per minute
            eye_movement_stability: Stability of eye movements (0-1)
            focus_duration: Duration of focus on screen (seconds)
        """
        if heart_rate is not None:
            self.heart_rates.append(heart_rate)
            if self.baseline_heart_rate is None and len(self.heart_rates) >= 5:
                # Calculate baseline from first 5 readings
                self.baseline_heart_rate = np.mean(list(self.heart_rates)[:5])
        
        if breathing_rate is not None:
            self.breathing_rates.append(breathing_rate)
            if self.baseline_breathing_rate is None and len(self.breathing_rates) >= 5:
                self.baseline_breathing_rate = np.mean(list(self.breathing_rates)[:5])
        
        # Store eye tracking metrics
        if gaze_direction != 'unknown':
            self.gaze_directions.append(gaze_direction)
        if blink_rate is not None:
            self.blink_rates.append(blink_rate)
        if eye_movement_stability > 0:
            self.eye_movement_stabilities.append(eye_movement_stability)
        if focus_duration > 0:
            self.focus_durations.append(focus_duration)
        
        # Calculate derived metrics (now using eye tracking data)
        focus_score = self._calculate_focus_score(heart_rate, breathing_rate, gaze_direction, eye_movement_stability, focus_duration)
        engagement_score = self._calculate_engagement_score(heart_rate, breathing_rate, gaze_direction, blink_rate)
        thinking_intensity = self._calculate_thinking_intensity(heart_rate, breathing_rate, gaze_direction, eye_movement_stability)
        
        metric = {
            'heart_rate': heart_rate,
            'breathing_rate': breathing_rate,
            'focus_score': focus_score,
            'engagement_score': engagement_score,
            'thinking_intensity': thinking_intensity,
            'gaze_direction': gaze_direction,
            'blink_rate': blink_rate,
            'eye_movement_stability': eye_movement_stability,
            'focus_duration': focus_duration,
            'timestamp': datetime.now().isoformat()
        }
        
        self.metrics_history.append(metric)
        self.frame_count += 1
        
        return metric
    
    def _calculate_focus_score(self, heart_rate, breathing_rate, gaze_direction='unknown', eye_movement_stability=0.0, focus_duration=0.0):
        """
        Calculate focus score using multiplicative factors.
        Base score from vitals, then multiplied by eye tracking factors.
        """
        if heart_rate is None or breathing_rate is None:
            return 0
        
        # Calculate base score from vitals (0-100)
        base_score = 100  # Start with neutral base
        
        # Heart rate in moderate range (60-100 BPM) indicates focus
        base_score *= math.abs((FOCUS_HEART_RATE_MAX - heart_rate) - (heart_rate - FOCUS_HEART_RATE_MIN));
        base_score = 100-base_score;
        
        base_score = min(100, base_score);
        base_score = max(0, base_score);
        
        
            
        
        # Stable breathing indicates focus
        if len(self.breathing_rates) >= 3 and np is not None:
            breathing_std = np.std(list(self.breathing_rates))
            if breathing_std < FOCUS_BREATHING_STABILITY_THRESHOLD:
                base_score *=0.8
            elif breathing_std < FOCUS_BREATHING_STABILITY_THRESHOLD * 2:
                base_score *=0.9
        else:
            base_score *=0.95  # Not enough data yet
        
        # Heart rate stability
        if len(self.heart_rates) >= 3 and np is not None:
            heart_std = np.std(list(self.heart_rates))
            if heart_std < 5:  # Very stable
                base_score += 10
            elif heart_std < 10:
                base_score += 5
        
        base_score = min(100, base_score)
        
        # Apply multiplicative factors from eye tracking
        gaze_factor = 1.0
        if gaze_direction == 'screen':
            gaze_factor = 1.0  # No penalty for looking at screen
        elif gaze_direction == 'away':
            # Looking away significantly reduces focus
            gaze_factor = 0.5  # 50% reduction
        else:
            # Unknown gaze direction - slight penalty
            gaze_factor = 0.8  # 20% reduction
        
        # Eye movement stability factor
        stability_factor = 1.0
        if eye_movement_stability > 0.8:
            stability_factor = 1.0  # Very stable, no penalty
        elif eye_movement_stability > 0.6:
            stability_factor = 0.95  # Slight penalty
        elif eye_movement_stability > 0.4:
            stability_factor = 0.85  # Moderate penalty
        elif eye_movement_stability > 0.2:
            stability_factor = 0.7  # Significant penalty
        elif eye_movement_stability > 0:
            stability_factor = 0.6  # Large penalty
        else:
            stability_factor = 0.5  # No eye tracking data, significant penalty
        
        # Focus duration factor (longer focus = higher multiplier)
        duration_factor = 1.0
        if focus_duration > 5.0:  # 5+ seconds of focus
            duration_factor = 1.0  # No penalty
        elif focus_duration > 2.0:  # 2+ seconds
            duration_factor = 0.95
        elif focus_duration > 0.5:  # 0.5+ seconds
            duration_factor = 0.9
        else:
            duration_factor = 0.8  # Very short focus duration
        
        # Apply all factors multiplicatively
        final_score = base_score * gaze_factor * stability_factor * duration_factor
        
        return min(100, max(0, int(final_score)))
    
    def _calculate_engagement_score(self, heart_rate, breathing_rate, gaze_direction='unknown', blink_rate=None):
        """
        Calculate engagement score using multiplicative factors.
        Base score from vitals, then multiplied by eye tracking factors.
        """
        if heart_rate is None or breathing_rate is None:
            return 0
        
        # Calculate base score from vitals (0-100)
        base_score = 50  # Start with neutral base
        
        # Engaged heart rate range (70-90 BPM)
        if 70 <= heart_rate <= 90:
            base_score += 30
        elif 60 <= heart_rate < 70 or 90 < heart_rate <= 100:
            base_score += 20
        else:
            base_score += 10
        
        # Regular breathing (12-18 BPM is normal)
        if 12 <= breathing_rate <= 18:
            base_score += 20
        elif 10 <= breathing_rate < 12 or 18 < breathing_rate <= 20:
            base_score += 15
        else:
            base_score += 10
        
        base_score = min(100, base_score)
        
        # Apply multiplicative factors from eye tracking
        gaze_factor = 1.0
        if gaze_direction == 'screen':
            gaze_factor = 1.0  # No penalty for looking at screen
        elif gaze_direction == 'away':
            # Looking away reduces engagement
            gaze_factor = 0.6  # 40% reduction
        else:
            # Unknown gaze direction - moderate penalty
            gaze_factor = 0.85  # 15% reduction
        
        # Blink rate factor (normal blink rate indicates engagement)
        # Normal blink rate is 15-20 blinks per minute
        blink_factor = 1.0
        if blink_rate is not None:
            if 12 <= blink_rate <= 25:
                blink_factor = 1.0  # Normal blink rate, no penalty
            elif 8 <= blink_rate < 12 or 25 < blink_rate <= 30:
                blink_factor = 0.9  # Slightly outside normal
            elif blink_rate < 8:
                blink_factor = 0.7  # Too low, might be drowsy
            else:
                blink_factor = 0.8  # Too high, might be stressed
        else:
            # No blink rate data - slight penalty
            blink_factor = 0.9
        
        # Apply all factors multiplicatively
        final_score = base_score * gaze_factor * blink_factor
        
        return min(100, max(0, int(final_score)))
    
    def _calculate_thinking_intensity(self, heart_rate, breathing_rate, gaze_direction='unknown', eye_movement_stability=0.0):
        """
        Calculate thinking intensity using multiplicative factors.
        Base score from vitals, then multiplied by eye tracking factors.
        """
        if heart_rate is None or breathing_rate is None:
            return 0
        
        # Calculate base score from vitals (0-100)
        base_score = 50  # Start with neutral base
        
        # Slower breathing indicates deep thinking
        if breathing_rate < THINKING_BREATHING_SLOW_THRESHOLD:
            base_score += 30
        elif breathing_rate < THINKING_BREATHING_SLOW_THRESHOLD + 2:
            base_score += 20
        else:
            base_score += 10
        
        # Heart rate increase from baseline (but not too high)
        if self.baseline_heart_rate is not None:
            heart_increase = heart_rate - self.baseline_heart_rate
            if 5 <= heart_increase <= THINKING_HEART_RATE_INCREASE:
                base_score += 20
            elif heart_increase > THINKING_HEART_RATE_INCREASE:
                base_score += 10  # Too high, might be stress
        else:
            base_score += 10  # Baseline not established yet
        
        # Very stable vitals indicate locked gaze/focus
        if len(self.heart_rates) >= 5 and len(self.breathing_rates) >= 5 and np is not None:
            heart_std = np.std(list(self.heart_rates))
            breathing_std = np.std(list(self.breathing_rates))
            if heart_std < 3 and breathing_std < 1.5:
                base_score += 20
            elif heart_std < 5 and breathing_std < 2:
                base_score += 10
        
        base_score = min(100, base_score)
        
        # Apply multiplicative factors from eye tracking
        # Locked gaze on screen with high stability is key for thinking
        gaze_stability_factor = 1.0
        if gaze_direction == 'screen' and eye_movement_stability > 0.7:
            # Perfect: looking at screen with high stability
            gaze_stability_factor = 1.0  # No penalty
        elif gaze_direction == 'screen' and eye_movement_stability > 0.5:
            # Good: looking at screen with moderate stability
            gaze_stability_factor = 0.9  # Slight penalty
        elif gaze_direction == 'screen':
            # Looking at screen but eyes moving around
            gaze_stability_factor = 0.75  # Moderate penalty
        elif gaze_direction == 'away':
            # Looking away significantly reduces thinking intensity
            gaze_stability_factor = 0.5  # Large penalty
        else:
            # Unknown gaze direction
            gaze_stability_factor = 0.7  # Moderate penalty
        
        # Eye movement stability factor (more important for thinking)
        stability_factor = 1.0
        if eye_movement_stability > 0.8:
            stability_factor = 1.0  # Very stable, no penalty
        elif eye_movement_stability > 0.6:
            stability_factor = 0.9  # Slight penalty
        elif eye_movement_stability > 0.4:
            stability_factor = 0.75  # Moderate penalty
        elif eye_movement_stability > 0.2:
            stability_factor = 0.6  # Significant penalty
        elif eye_movement_stability > 0:
            stability_factor = 0.5  # Large penalty
        else:
            stability_factor = 0.4  # No eye tracking data, very large penalty
        
        # Apply all factors multiplicatively
        final_score = base_score * gaze_stability_factor * stability_factor
        
        return min(100, max(0, int(final_score)))
    
    def get_aggregated_metrics(self):
        """Get aggregated metrics for the session"""
        if len(self.metrics_history) == 0:
            return None
        
        metrics_list = list(self.metrics_history)
        
        heart_rates = [m['heart_rate'] for m in metrics_list if m['heart_rate'] is not None]
        breathing_rates = [m['breathing_rate'] for m in metrics_list if m['breathing_rate'] is not None]
        focus_scores = [m['focus_score'] for m in metrics_list]
        engagement_scores = [m['engagement_score'] for m in metrics_list]
        thinking_intensities = [m['thinking_intensity'] for m in metrics_list]
        
        # Calculate averages (with fallback if numpy not available)
        if np is not None:
            avg_hr = np.mean(heart_rates) if heart_rates else None
            avg_br = np.mean(breathing_rates) if breathing_rates else None
            avg_focus = np.mean(focus_scores) if focus_scores else 0
            avg_engagement = np.mean(engagement_scores) if engagement_scores else 0
            avg_thinking = np.mean(thinking_intensities) if thinking_intensities else 0
            hr_std = np.std(heart_rates) if len(heart_rates) > 1 else None
            br_std = np.std(breathing_rates) if len(breathing_rates) > 1 else None
        else:
            # Fallback calculation without numpy
            avg_hr = sum(heart_rates) / len(heart_rates) if heart_rates else None
            avg_br = sum(breathing_rates) / len(breathing_rates) if breathing_rates else None
            avg_focus = sum(focus_scores) / len(focus_scores) if focus_scores else 0
            avg_engagement = sum(engagement_scores) / len(engagement_scores) if engagement_scores else 0
            avg_thinking = sum(thinking_intensities) / len(thinking_intensities) if thinking_intensities else 0
            # Simple std dev calculation
            if len(heart_rates) > 1:
                mean_hr = avg_hr
                hr_std = (sum((x - mean_hr) ** 2 for x in heart_rates) / len(heart_rates)) ** 0.5
            else:
                hr_std = None
            if len(breathing_rates) > 1:
                mean_br = avg_br
                br_std = (sum((x - mean_br) ** 2 for x in breathing_rates) / len(breathing_rates)) ** 0.5
            else:
                br_std = None
        
        result = {
            'average_heart_rate': avg_hr,
            'average_breathing_rate': avg_br,
            'average_focus_score': avg_focus,
            'average_engagement_score': avg_engagement,
            'average_thinking_intensity': avg_thinking,
            'heart_rate_std_dev': hr_std,
            'breathing_rate_std_dev': br_std,
            'total_frames': self.frame_count
        }
        
        return result


def process_frame_with_custom_metrics(frame_data, custom_processor=None, api_key=None):
    """
    Process a video frame using custom metrics (eye tracking + heart rate).
    Uses custom metrics as PRIMARY source for all metrics.
    
    Falls back to Presage only if custom metrics are unavailable.
    """
    # Try custom metrics FIRST (primary source)
    if custom_processor is not None:
        try:
            custom_vitals = custom_processor.process_frame(frame_data, time.time())
            
            if custom_vitals and (custom_vitals.get('heart_rate') is not None or custom_vitals.get('breathing_rate') is not None):
                # Custom metrics available and working
                print(f"✅ [CUSTOM] Using custom metrics: HR={custom_vitals.get('heart_rate')}, BR={custom_vitals.get('breathing_rate')}, Gaze={custom_vitals.get('gaze_direction')}")
                custom_vitals['source'] = 'custom'
                return custom_vitals
            else:
                print(f"⚠️ [CUSTOM] Custom metrics returned None/empty, trying Presage fallback")
        except Exception as e:
            print(f"❌ [CUSTOM] Custom metrics processing failed: {e}")
            import traceback
            traceback.print_exc()
    
    # Fallback to Presage if custom metrics unavailable
    import os
    import json
    
    # Auto-detect wrapper: Try Swift wrapper first (macOS), then C++ wrapper
    wrapper_paths = [
        os.path.join(os.path.dirname(__file__), 'presage_wrapper'),
        os.path.join(os.path.dirname(__file__), 'presage_wrapper_cpp'),
        'presage_wrapper',
        'presage_wrapper_cpp'
    ]
    
    wrapper_path = None
    for path in wrapper_paths:
        if os.path.exists(path) or shutil.which(path):
            wrapper_path = path
            break
    
    # Try Presage SDK as fallback
    presage_vitals = None
    if wrapper_path and (os.path.exists(wrapper_path) or shutil.which(wrapper_path)):
        print(f"🔍 [DEBUG] Trying Presage wrapper at: {wrapper_path}")
        # Save frame to temporary file
        temp_file = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        try:
            cv2.imwrite(temp_file.name, frame_data)
            temp_file.close()
            
            # Call the wrapper (Swift or C++)
            result = subprocess.run(
                [wrapper_path, temp_file.name, api_key],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                # Parse JSON output
                try:
                    metrics = json.loads(result.stdout.strip())
                    presage_vitals = {
                        'heart_rate': metrics.get('heart_rate'),
                        'breathing_rate': metrics.get('breathing_rate'),
                        'source': 'presage'
                    }
                except json.JSONDecodeError as e:
                    print(f"⚠️ [PRESAGE] Error parsing wrapper output: {e}")
                    print(f"  Output: {result.stdout}")
                    print(f"  Error: {result.stderr}")
                    presage_vitals = None
            else:
                print(f"⚠️ [PRESAGE] Wrapper error (code {result.returncode}): {result.stderr}")
                presage_vitals = None
                
        except subprocess.TimeoutExpired:
            print("⚠️ [PRESAGE] Wrapper call timed out")
            presage_vitals = None
        except Exception as e:
            print(f"⚠️ [PRESAGE] Error calling Presage wrapper: {e}")
            presage_vitals = None
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_file.name)
            except:
                pass
    else:
        print(f"⚠️ [PRESAGE] Wrapper not found. Tried paths: {', '.join(wrapper_paths)}")
        presage_vitals = None
    
    # If Presage worked, return it
    if presage_vitals is not None and presage_vitals.get('heart_rate') and presage_vitals.get('breathing_rate'):
        print(f"✅ [PRESAGE] Using Presage fallback: HR={presage_vitals.get('heart_rate')}, BR={presage_vitals.get('breathing_rate')}")
        return presage_vitals
    
    # Final fallback: simulated data (only if both custom and Presage failed)
    print(f"⚠️ [FALLBACK] Both custom and Presage metrics failed, using simulated data")
    if custom_processor is None:
        print(f"  Custom metrics not available (install mediapipe and scipy)")
    import random
    return {
        'heart_rate': random.uniform(65, 85),
        'breathing_rate': random.uniform(14, 18),
        'source': 'simulated'
    }


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'vitals-service',
        'presage_configured': bool(PRESAGE_API_KEY),
        'custom_metrics_available': CUSTOM_METRICS_AVAILABLE
    })


@app.route('/api/vitals/session/start', methods=['POST'])
def start_session():
    """Start a new vitals collection session"""
    try:
        data = request.json
        session_id = data.get('session_id')
        api_key = data.get('api_key') or PRESAGE_API_KEY
        
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400
        
        if not api_key:
            return jsonify({'error': 'API key is required'}), 400
        
        with session_lock:
            if session_id in sessions:
                # Session already exists, return success (idempotent)
                return jsonify({
                    'success': True,
                    'session_id': session_id,
                    'message': 'Session already exists'
                })
            
            session = VitalsSession(session_id, api_key)
            sessions[session_id] = session
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'Session started'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/vitals/frame', methods=['POST'])
def process_frame():
    """Process a video frame and return metrics"""
    try:
        data = request.json
        session_id = data.get('session_id')
        frame_base64 = data.get('frame')
        timestamp = data.get('timestamp')
        
        if not session_id or not frame_base64:
            return jsonify({'error': 'session_id and frame are required'}), 400
        
        with session_lock:
            if session_id not in sessions:
                print(f"⚠️ [FRAME] Session not found: {session_id[:30]}... | Available sessions: {list(sessions.keys())[:3]}")
                return jsonify({'error': 'Session not found'}), 404
            
            session = sessions[session_id]
        
        # Log frame received
        print(f"📹 [FRAME] Received frame - Session: {session_id[:20]}... | Size: {len(frame_base64)} bytes")
        
        # Decode frame
        try:
            frame_bytes = base64.b64decode(frame_base64)
            if np is None:
                raise ImportError("numpy is not available")
            frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
            frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
        except Exception as decode_error:
            print(f"⚠️ [FRAME] Failed to decode frame - Session: {session_id[:20]}... | Error: {str(decode_error)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Invalid frame data: {str(decode_error)}'}), 400
        
        if frame is None:
            print(f"⚠️ [FRAME] Failed to decode frame (cv2.imdecode returned None) - Session: {session_id[:20]}...")
            return jsonify({'error': 'Invalid frame data: cv2.imdecode returned None'}), 400
        
        # Process with custom metrics (primary) - Presage as fallback
        api_key = session.api_key
        vitals = process_frame_with_custom_metrics(frame, custom_processor=session.custom_processor, api_key=api_key)
        
        # Log source of metrics
        source = vitals.get('source', 'unknown')
        print(f"📊 [FRAME] Using {source} metrics: HR={vitals.get('heart_rate', 'N/A')}, BR={vitals.get('breathing_rate', 'N/A')}, Gaze={vitals.get('gaze_direction', 'N/A')}")
        
        # Extract eye tracking metrics from custom vitals
        gaze_direction = vitals.get('gaze_direction', 'unknown')
        blink_rate = vitals.get('blink_rate')
        eye_movement_stability = vitals.get('eye_movement_stability', 0.0)
        focus_duration = vitals.get('focus_duration', 0.0)
        
        # Add to session and calculate derived metrics (now with eye tracking)
        metric = session.add_metrics(
            vitals.get('heart_rate'),
            vitals.get('breathing_rate'),
            gaze_direction=gaze_direction,
            blink_rate=blink_rate,
            eye_movement_stability=eye_movement_stability,
            focus_duration=focus_duration
        )
        
        # Log metrics in real-time for testing
        print(f"📊 [METRICS] Frame processed - Session: {session_id[:20]}... | "
              f"HR: {metric.get('heart_rate', 'N/A')} BPM | "
              f"BR: {metric.get('breathing_rate', 'N/A')} BPM | "
              f"Focus: {metric.get('focus_score', 0):.1f}/100 | "
              f"Engagement: {metric.get('engagement_score', 0):.1f}/100 | "
              f"Thinking: {metric.get('thinking_intensity', 0):.1f}/100 | "
              f"Frame #{session.frame_count}")
        
        return jsonify({
            'success': True,
            'metrics': metric
        })
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        print(f"❌ [FRAME] Error processing frame: {error_msg}")
        print(f"Traceback:\n{traceback_str}")
        return jsonify({'error': error_msg, 'details': traceback_str}), 500


@app.route('/api/vitals/session/stop', methods=['POST'])
def stop_session():
    """Stop a session and return aggregated metrics"""
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400
        
        with session_lock:
            if session_id not in sessions:
                return jsonify({'error': 'Session not found'}), 404
            
            session = sessions[session_id]
            aggregated = session.get_aggregated_metrics()
            
            # Clean up custom processor
            if session.custom_processor:
                try:
                    session.custom_processor.reset()
                except:
                    pass
            
            # Remove session
            del sessions[session_id]
        
        if aggregated is None:
            return jsonify({
                'success': True,
                'message': 'Session stopped but no metrics collected'
            })
        
        return jsonify({
            'success': True,
            'aggregated_metrics': aggregated
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print(f'Starting Vitals Service on port {VITALS_SERVICE_PORT}')
    print(f'Presage API Key configured: {bool(PRESAGE_API_KEY)}')
    app.run(host='0.0.0.0', port=VITALS_SERVICE_PORT, debug=True)

