import { useEffect } from 'react';
import Dashboard from './components/Dashboard';
import { useNotifications } from './hooks/useNotifications';
import './App.css';

function App() {
  const { requestPermission, permission } = useNotifications();

  // Request notification permissions on mount
  // Requirement 2.5: Request browser notification permissions on initial load
  useEffect(() => {
    const initNotifications = async () => {
      // Only request if permission hasn't been determined yet
      if (permission === 'default') {
        try {
          const result = await requestPermission();
          console.log('Notification permission:', result);
          
          // Preload sounds after permission is granted
          if (result === 'granted') {
            // Import notification service to preload sounds
            const notificationService = (await import('./services/notifications.js')).default;
            await notificationService.preloadSounds();
          }
        } catch (error) {
          console.error('Error requesting notification permission:', error);
        }
      } else if (permission === 'granted') {
        // Preload sounds if permission already granted
        const notificationService = (await import('./services/notifications.js')).default;
        await notificationService.preloadSounds();
      }
    };

    initNotifications();
  }, [permission, requestPermission]);

  // Enable audio on first user interaction
  useEffect(() => {
    const enableAudio = async () => {
      const notificationService = (await import('./services/notifications.js')).default;
      await notificationService.preloadSounds();
      console.log('🔊 Audio enabled after user interaction');
    };

    // Listen for first click to enable audio
    const handleFirstClick = () => {
      enableAudio();
      document.removeEventListener('click', handleFirstClick);
    };

    document.addEventListener('click', handleFirstClick);

    return () => {
      document.removeEventListener('click', handleFirstClick);
    };
  }, []);

  return (
    <div className="app">
      <Dashboard />
    </div>
  );
}

export default App;
