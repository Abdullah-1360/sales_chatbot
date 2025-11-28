/**
 * Audio Generator Utility
 * Generates simple notification sounds using Web Audio API as fallback
 * when audio files are not available
 */

class AudioGenerator {
  constructor() {
    this.audioContext = null;
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioContext = new AudioContext();
      }
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  /**
   * Generate a simple notification beep sound
   * @param {string} type - Type of notification ('lead' or 'chat')
   */
  playGeneratedSound(type = 'lead') {
    if (!this.audioContext) {
      console.warn('Audio context not available');
      return;
    }

    try {
      // Resume audio context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Different frequencies for different notification types
      if (type === 'lead') {
        // Two-tone beep for new leads (higher pitch)
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1);
      } else {
        // Single tone for chats (lower pitch)
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
      }

      oscillator.type = 'sine';

      // Envelope for smooth sound
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);
    } catch (error) {
      console.error('Error generating sound:', error);
    }
  }
}

const audioGenerator = new AudioGenerator();
export default audioGenerator;
