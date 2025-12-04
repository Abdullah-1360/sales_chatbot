/**
 * Notification Service
 * Handles browser notifications and audio alerts for new leads
 * Requirements: 2.1, 2.2, 2.5
 */

class NotificationService {
  constructor() {
    // Initialize with browser's actual permission status
    this.permission = ('Notification' in window) ? Notification.permission : 'denied';
    this.audioCache = new Map();
  }

  /**
   * Request browser notification permission
   * Requirement 2.5: Request browser notification permissions on initial load
   * @returns {Promise<string>} Permission status ('granted', 'denied', or 'default')
   */
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      this.permission = 'denied';
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      this.permission = 'denied';
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      this.permission = 'denied';
      return 'denied';
    }
  }

  /**
   * Show a browser notification
   * Requirement 2.1: Display visual notification with lead's name and email
   * @param {Object} options - Notification options
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body text
   * @param {string} options.icon - Optional icon URL
   * @param {string} options.tag - Optional tag for grouping notifications
   * @returns {Notification|null} Notification instance or null if not supported
   */
  showNotification({ title, body, icon, tag }) {
    // Handle permission denied gracefully (Requirement: Handle permission denied gracefully)
    if (!('Notification' in window) || this.permission !== 'granted') {
      console.log('Notifications not available or permission denied:', { title, body });
      return null;
    }

    try {
      const notification = new Notification(title, {
        body,
        icon: icon || '/vite.svg',
        tag: tag || 'lead-notification',
        requireInteraction: false,
        silent: false,
      });

      // Auto-close notification after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }

  /**
   * Play an audio notification sound
   * Requirement 2.2: Play distinct audio notification sound
   * Requirement 2.3: Use different audio sound for new leads than for incoming chats
   * @param {string} soundType - Type of sound ('new-lead' or 'new-chat')
   * @returns {Promise<void>}
   */
  async playSound(soundType = 'new-lead') {
    try {
      console.log(`🔊 Attempting to play sound: ${soundType}`);
      
      let audio = this.audioCache.get(soundType);

      if (!audio) {
        console.log(`📥 Loading sound file: ${soundType}`);
        const soundPath = `/sounds/${soundType}.mp3`;
        audio = new Audio(soundPath);
        audio.preload = 'auto';
        audio.volume = 0.7; // Set volume to 70%
        this.audioCache.set(soundType, audio);
        
        // Wait a bit for the audio to load
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Reset audio to beginning if already playing
      audio.currentTime = 0;
      audio.volume = 0.7; // Ensure volume is set
      
      console.log(`▶️ Playing ${soundType} sound...`);
      
      // Try to play the audio
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        await playPromise;
        console.log(`✅ ${soundType} sound played successfully`);
      }
    } catch (error) {
      // Handle permission denied or audio playback errors gracefully
      if (error.name === 'NotAllowedError') {
        console.warn(`⚠️ Audio playback blocked by browser. User interaction required first.`);
        console.warn(`💡 Tip: Click anywhere on the page to enable audio`);
      } else if (error.name === 'NotSupportedError') {
        console.warn(`⚠️ Audio format not supported: ${soundType}`);
      } else {
        console.warn(`⚠️ Could not play ${soundType} sound:`, error.name, error.message);
      }
    }
  }

  /**
   * Show notification for a new lead with audio
   * Requirement 2.1: Display visual notification with lead's name and email
   * Requirement 2.2: Play distinct audio notification sound
   * @param {Object} lead - Lead object
   * @param {string} lead.firstname - Lead first name
   * @param {string} lead.lastname - Lead last name
   * @param {string} lead.email - Lead email
   * @param {boolean} lead.isUpdate - Whether this is an update to existing lead
   * @returns {Promise<void>}
   */
  async notifyNewLead(lead) {
    console.log('notifyNewLead called with:', lead);
    
    const isUpdate = lead.isUpdate || false;
    const title = isUpdate ? '🔄 Lead Updated!' : '🎉 New Lead Received!';
    const name = `${lead.firstname || ''} ${lead.lastname || ''}`.trim() || 'Unknown';
    const body = `${name}\n${lead.email || 'No email provided'}`;

    console.log('Notification details:', { title, body, permission: this.permission, isUpdate });

    // Show visual notification
    const notification = this.showNotification({
      title,
      body,
      tag: `lead-${lead.id || Date.now()}`,
    });

    if (!notification) {
      console.warn('Notification not shown. Permission:', this.permission);
    }

    // Play audio notification
    try {
      await this.playSound('new-lead');
      console.log('Sound played successfully');
    } catch (error) {
      console.error('Failed to play sound:', error);
    }
  }

  /**
   * Show notification for an incoming chat with audio
   * Requirement 2.3: Use different audio sound for new leads than for incoming chats
   * @param {Object} chat - Chat object
   * @returns {Promise<void>}
   */
  async notifyIncomingChat(chat) {
    console.log('notifyIncomingChat called with:', chat);
    
    const title = '💬 New Chat Message!';
    const name = `${chat.firstname || ''} ${chat.lastname || ''}`.trim() || 'Unknown';
    const body = `${name}\n${chat.email || 'No email provided'}`;

    console.log('Chat notification details:', { title, body, permission: this.permission });

    // Show visual notification
    const notification = this.showNotification({
      title,
      body,
      tag: `chat-${chat.id || Date.now()}`,
    });

    if (!notification) {
      console.warn('Chat notification not shown. Permission:', this.permission);
    }

    // Play audio notification with different sound
    try {
      await this.playSound('new-chat');
      console.log('Chat sound played successfully');
    } catch (error) {
      console.error('Failed to play chat sound:', error);
    }
  }

  /**
   * Get current permission status
   * @returns {string} Permission status
   */
  getPermissionStatus() {
    return this.permission;
  }

  /**
   * Check if notifications are supported and enabled
   * @returns {boolean}
   */
  isEnabled() {
    return 'Notification' in window && this.permission === 'granted';
  }

  /**
   * Preload audio files (call this on user interaction to enable autoplay)
   * @returns {Promise<void>}
   */
  async preloadSounds() {
    try {
      // Preload both sound types
      const sounds = ['new-lead', 'new-chat'];
      
      for (const soundType of sounds) {
        if (!this.audioCache.has(soundType)) {
          const soundPath = `/sounds/${soundType}.mp3`;
          const audio = new Audio(soundPath);
          audio.preload = 'auto';
          audio.volume = 0.7;
          this.audioCache.set(soundType, audio);
          
          // Try to play and immediately pause to unlock autoplay
          // This is a common technique to enable audio in browsers
          try {
            audio.volume = 0; // Mute for the unlock attempt
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              await playPromise;
              audio.pause();
              audio.currentTime = 0;
              audio.volume = 0.7; // Restore volume
            }
          } catch (unlockError) {
            // Ignore errors during unlock attempt
            console.log(`Audio unlock attempt for ${soundType}:`, unlockError.message);
          }
        }
      }
      
      console.log('🔊 Sounds preloaded and unlocked successfully');
    } catch (error) {
      console.warn('Failed to preload sounds:', error);
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();
export default notificationService;
