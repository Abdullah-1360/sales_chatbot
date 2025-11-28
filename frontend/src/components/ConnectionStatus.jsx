import useWebSocket from '../hooks/useWebSocket';
import '../styles/ConnectionStatus.css';

function ConnectionStatus() {
  const { isConnected, reconnectAttempts, connectionStatus } = useWebSocket();

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

  return (
    <div className={`connection-status ${status.className}`}>
      <span className="status-icon" aria-hidden="true">
        {status.icon}
      </span>
      <span className="status-text">{status.text}</span>
    </div>
  );
}

export default ConnectionStatus;
