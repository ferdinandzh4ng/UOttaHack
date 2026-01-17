"""
Heart Rate Monitor using Remote Photoplethysmography (rPPG)
Extracts heart rate and breathing rate from facial video frames.
"""

import cv2
import numpy as np
from collections import deque
from scipy import signal
import time


class HeartRateMonitor:
    """
    Monitors heart rate and breathing rate using rPPG technique.
    Extracts color signals from facial ROI and processes with FFT.
    """
    
    def __init__(self, fps=30, buffer_duration=30):
        """
        Initialize heart rate monitor.
        
        Args:
            fps: Expected frame rate (default 30)
            buffer_duration: Duration of signal buffer in seconds (default 30)
        """
        self.fps = fps
        self.buffer_size = int(fps * buffer_duration)  # 30 seconds of data
        self.signal_buffer = deque(maxlen=self.buffer_size)
        self.timestamp_buffer = deque(maxlen=self.buffer_size)
        
        # ROI (Region of Interest) for forehead detection
        # Will be set dynamically based on face detection
        self.roi = None
        self.roi_initialized = False
        
        # Face detector for ROI initialization
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        
        # Signal processing parameters
        self.hr_bandpass = (0.7, 4.0)  # Heart rate: 42-240 BPM
        self.br_bandpass = (0.1, 0.5)  # Breathing rate: 6-30 BPM
        
        # Moving average for stability
        self.hr_history = deque(maxlen=10)
        self.br_history = deque(maxlen=10)
        
        self.last_hr = None
        self.last_br = None
        self.signal_quality = 0.0
    
    def _detect_face(self, frame):
        """Detect face in frame and return bounding box."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(100, 100)
        )
        
        if len(faces) > 0:
            # Use largest face
            face = max(faces, key=lambda x: x[2] * x[3])
            return face
        return None
    
    def _initialize_roi(self, frame):
        """
        Initialize ROI (forehead region) from face detection.
        Forehead is approximately top 1/3 of face, centered horizontally.
        """
        face = self._detect_face(frame)
        if face is None:
            return False
        
        x, y, w, h = face
        
        # Forehead region: top 1/3 of face, centered
        roi_x = x + int(w * 0.2)  # Slight margin from edges
        roi_y = y + int(h * 0.1)  # Top of face
        roi_w = int(w * 0.6)  # Center 60% of face width
        roi_h = int(h * 0.25)  # Top 25% of face height
        
        # Ensure ROI is within frame bounds
        roi_x = max(0, roi_x)
        roi_y = max(0, roi_y)
        roi_w = min(roi_w, frame.shape[1] - roi_x)
        roi_h = min(roi_h, frame.shape[0] - roi_y)
        
        if roi_w > 50 and roi_h > 20:  # Minimum size check
            self.roi = (roi_x, roi_y, roi_w, roi_h)
            self.roi_initialized = True
            return True
        
        return False
    
    def _extract_signal(self, frame):
        """
        Extract color signal from ROI.
        Uses green channel as it's most sensitive to blood volume changes.
        """
        if not self.roi_initialized or self.roi is None:
            return None
        
        x, y, w, h = self.roi
        
        # Extract ROI
        roi_frame = frame[y:y+h, x:x+w]
        
        if roi_frame.size == 0:
            return None
        
        # Calculate mean of green channel (most sensitive to blood volume)
        green_channel = roi_frame[:, :, 1]  # BGR format, index 1 is green
        signal_value = np.mean(green_channel)
        
        return signal_value
    
    def _calculate_heart_rate(self, signal_array, timestamps):
        """
        Calculate heart rate from signal using FFT.
        
        Args:
            signal_array: Array of signal values
            timestamps: Array of corresponding timestamps
            
        Returns:
            Heart rate in BPM or None if calculation fails
        """
        if len(signal_array) < 30:  # Need at least 1 second of data at 30fps
            return None
        
        try:
            # Detrend signal (remove DC component and slow trends)
            detrended = signal.detrend(signal_array)
            
            # Apply bandpass filter for heart rate (0.7-4 Hz = 42-240 BPM)
            nyquist = self.fps / 2.0
            low = self.hr_bandpass[0] / nyquist
            high = self.hr_bandpass[1] / nyquist
            
            if low >= 1.0 or high >= 1.0:
                return None
            
            b, a = signal.butter(4, [low, high], btype='band')
            filtered = signal.filtfilt(b, a, detrended)
            
            # FFT to find dominant frequency
            fft = np.fft.rfft(filtered)
            fft_freq = np.fft.rfftfreq(len(filtered), 1.0 / self.fps)
            
            # Find peak in heart rate range
            hr_mask = (fft_freq >= self.hr_bandpass[0]) & (fft_freq <= self.hr_bandpass[1])
            if not np.any(hr_mask):
                return None
            
            fft_magnitude = np.abs(fft)
            hr_fft = fft_magnitude[hr_mask]
            hr_freqs = fft_freq[hr_mask]
            
            if len(hr_fft) == 0:
                return None
            
            # Find peak frequency
            peak_idx = np.argmax(hr_fft)
            peak_freq = hr_freqs[peak_idx]
            
            # Convert frequency to BPM
            heart_rate = peak_freq * 60.0
            
            # Validate range (reasonable HR: 40-200 BPM)
            if 40 <= heart_rate <= 200:
                return heart_rate
            
            return None
            
        except Exception as e:
            print(f"Error calculating heart rate: {e}")
            return None
    
    def _calculate_breathing_rate(self, signal_array, timestamps):
        """
        Calculate breathing rate from signal using FFT.
        Uses lower frequency band than heart rate.
        
        Args:
            signal_array: Array of signal values
            timestamps: Array of corresponding timestamps
            
        Returns:
            Breathing rate in BPM or None if calculation fails
        """
        if len(signal_array) < 60:  # Need at least 2 seconds of data
            return None
        
        try:
            # Detrend signal
            detrended = signal.detrend(signal_array)
            
            # Apply bandpass filter for breathing (0.1-0.5 Hz = 6-30 BPM)
            nyquist = self.fps / 2.0
            low = self.br_bandpass[0] / nyquist
            high = self.br_bandpass[1] / nyquist
            
            if low >= 1.0 or high >= 1.0:
                return None
            
            b, a = signal.butter(4, [low, high], btype='band')
            filtered = signal.filtfilt(b, a, detrended)
            
            # FFT to find dominant frequency
            fft = np.fft.rfft(filtered)
            fft_freq = np.fft.rfftfreq(len(filtered), 1.0 / self.fps)
            
            # Find peak in breathing rate range
            br_mask = (fft_freq >= self.br_bandpass[0]) & (fft_freq <= self.br_bandpass[1])
            if not np.any(br_mask):
                return None
            
            fft_magnitude = np.abs(fft)
            br_fft = fft_magnitude[br_mask]
            br_freqs = fft_freq[br_mask]
            
            if len(br_fft) == 0:
                return None
            
            # Find peak frequency
            peak_idx = np.argmax(br_fft)
            peak_freq = br_freqs[peak_idx]
            
            # Convert frequency to BPM
            breathing_rate = peak_freq * 60.0
            
            # Validate range (reasonable BR: 6-30 BPM)
            if 6 <= breathing_rate <= 30:
                return breathing_rate
            
            return None
            
        except Exception as e:
            print(f"Error calculating breathing rate: {e}")
            return None
    
    def _calculate_signal_quality(self, signal_array):
        """
        Calculate signal quality based on variance and stability.
        Returns value between 0-100.
        """
        if len(signal_array) < 10:
            return 0.0
        
        try:
            # Higher variance in filtered signal indicates better quality
            # (more variation = actual signal, not noise)
            variance = np.var(signal_array)
            
            # Normalize (empirical threshold)
            quality = min(100.0, variance * 100.0)
            
            return quality
        except:
            return 0.0
    
    def process_frame(self, frame, timestamp=None):
        """
        Process a single frame and update signal buffer.
        
        Args:
            frame: Video frame (BGR format)
            timestamp: Frame timestamp (default: current time)
            
        Returns:
            Dictionary with current metrics or None
        """
        if timestamp is None:
            timestamp = time.time()
        
        # Initialize ROI if not done
        if not self.roi_initialized:
            if not self._initialize_roi(frame):
                return None
        
        # Extract signal from ROI
        signal_value = self._extract_signal(frame)
        if signal_value is None:
            # Try to reinitialize ROI
            if self._initialize_roi(frame):
                signal_value = self._extract_signal(frame)
            if signal_value is None:
                return None
        
        # Add to buffer
        self.signal_buffer.append(signal_value)
        self.timestamp_buffer.append(timestamp)
        
        # Need minimum data for calculation
        if len(self.signal_buffer) < 30:  # At least 1 second at 30fps
            return {
                'heart_rate': None,
                'breathing_rate': None,
                'signal_quality': 0.0,
                'buffer_fill': len(self.signal_buffer) / self.buffer_size
            }
        
        # Convert to numpy arrays
        signal_array = np.array(self.signal_buffer)
        timestamps_array = np.array(self.timestamp_buffer)
        
        # Calculate heart rate
        heart_rate = self._calculate_heart_rate(signal_array, timestamps_array)
        
        # Calculate breathing rate (needs more data)
        breathing_rate = None
        if len(self.signal_buffer) >= 60:  # At least 2 seconds
            breathing_rate = self._calculate_breathing_rate(signal_array, timestamps_array)
        
        # Update history with moving average
        if heart_rate is not None:
            self.hr_history.append(heart_rate)
            # Use median for stability (less affected by outliers)
            self.last_hr = np.median(list(self.hr_history))
        else:
            self.last_hr = None
        
        if breathing_rate is not None:
            self.br_history.append(breathing_rate)
            self.last_br = np.median(list(self.br_history))
        else:
            self.last_br = None
        
        # Calculate signal quality
        self.signal_quality = self._calculate_signal_quality(signal_array)
        
        return {
            'heart_rate': self.last_hr,
            'breathing_rate': self.last_br,
            'signal_quality': self.signal_quality,
            'buffer_fill': len(self.signal_buffer) / self.buffer_size
        }
    
    def get_current_metrics(self):
        """Get current metrics without processing a new frame."""
        return {
            'heart_rate': self.last_hr,
            'breathing_rate': self.last_br,
            'signal_quality': self.signal_quality,
            'buffer_fill': len(self.signal_buffer) / self.buffer_size
        }
    
    def reset(self):
        """Reset the monitor (clear buffers, reinitialize ROI)."""
        self.signal_buffer.clear()
        self.timestamp_buffer.clear()
        self.hr_history.clear()
        self.br_history.clear()
        self.roi = None
        self.roi_initialized = False
        self.last_hr = None
        self.last_br = None
        self.signal_quality = 0.0

