import { useState } from 'react';
import TabNavigation from './TabNavigation';
import NewLeadsTab from './NewLeadsTab';
import IncomingChatsTab from './IncomingChatsTab';
import ConnectionStatus from './ConnectionStatus';
import '../styles/Dashboard.css';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('new-leads');

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Real-time Dashboard</h1>
        <ConnectionStatus />
      </div>
      
      <TabNavigation 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
      />
      
      <div className="dashboard-content">
        <div style={{ display: activeTab === 'new-leads' ? 'block' : 'none' }}>
          <NewLeadsTab />
        </div>
        <div style={{ display: activeTab === 'incoming-chats' ? 'block' : 'none' }}>
          <IncomingChatsTab />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
