import { useEffect } from 'react';
import Dashboard from './components/Dashboard';
import { useNotifications } from './hooks/useNotifications';
import chatNotificationService from './services/chatNotificationService';
import './App.css';
import './styles/ChatNotifications.css';

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
          
          // Initialize chat notification service after permission is granted
          if (result === 'granted') {
            await chatNotificationService.initialize();
            console.log('✅ Chat notification service initialized');
          }
        } catch (error) {
          console.error('Error requesting notification permission:', error);
        }
      } else if (permission === 'granted') {
        // Initialize chat notification service if permission already granted
        await chatNotificationService.initialize();
        console.log('✅ Chat notification service initialized');
      }
    };

    initNotifications();
  }, [permission, requestPermission]);

  // Enable audio on first user interaction
  useEffect(() => {
    const enableAudio = async () => {
      await chatNotificationService.initialize();
      console.log('🔊 Chat notification service enabled after user interaction');
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
