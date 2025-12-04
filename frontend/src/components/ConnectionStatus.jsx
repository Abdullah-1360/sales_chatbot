import { useState } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import useNotifications from '../hooks/useNotifications';
import '../styles/ConnectionStatus.css';

function ConnectionStatus() {
  const { isConnected, reconnectAttempts, connectionStatus } = useWebSocket();
  const { playSound } = useNotifications();
  const [showSoundTest, setShowSoundTest] = useState(false);

  const getStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connected':
      case 'reconnected':
        return {
          text: 'Connected',
          className: 'connected',
          icon: '●'
        };
      case 'reconnecting':
        return {
          text: `Reconnecting${reconnectAttempts > 0 ? ` (${reconnectAttempts})` : '...'}`,
          className: 'reconnecting',
          icon: '◐'
        };
      case 'disconnected':
      case 'error':
      case 'reconnect_failed':
        return {
          text: 'Disconnected',
          className: 'disconnected',
          icon: '●'
        };
      default:
        return {
          text: 'Connecting...',
          className: 'connecting',
          icon: '○'
        };
    }
  };

  const status = getStatusDisplay();

  const handleTestSound = async (soundType) => {
    console.log(`Testing ${soundType} sound...`);
    await playSound(soundType);
  };

  return (
    <div className="connection-status-wrapper">
      <div className={`connection-status ${status.className}`}>
        <span className="status-icon" aria-hidden="true">
          {status.icon}
        </span>
        <span className="status-text">{status.text}</span>
      </div>
      
      <button 
        className="sound-test-toggle"
        onClick={() => setShowSoundTest(!showSoundTest)}
        title="Test notification sounds"
      >
        🔊
      </button>
      
      {showSoundTest && (
        <div className="sound-test-panel">
          <button onClick={() => handleTestSound('new-lead')}>
            Test Lead Sound
          </button>
          <button onClick={() => handleTestSound('new-chat')}>
            Test Chat Sound
          </button>
        </div>
      )}
    </div>
  );
}

export default ConnectionStatus;
