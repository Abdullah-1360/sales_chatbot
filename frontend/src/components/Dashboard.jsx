import { useState, useCallback } from 'react';
import TabNavigation from './TabNavigation';
import NewLeadsTab from './NewLeadsTab';
import IncomingChatsTab from './IncomingChatsTab';
import ConnectionStatus from './ConnectionStatus';
import '../styles/Dashboard.css';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('new-leads');
  const [unreadLeads, setUnreadLeads] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    
    // Clear unread count when tab is opened
    if (tabId === 'new-leads') {
      setUnreadLeads(0);
    } else if (tabId === 'incoming-chats') {
      setUnreadChats(0);
    }
  };

  // Callback to increment unread leads count
  const incrementUnreadLeads = useCallback(() => {
    // Only increment if not on leads tab
    setActiveTab((currentTab) => {
      if (currentTab !== 'new-leads') {
        setUnreadLeads((prev) => prev + 1);
      }
      return currentTab;
    });
  }, []);

  // Callback to increment unread chats count
  const incrementUnreadChats = useCallback(() => {
    // Only increment if not on chats tab
    setActiveTab((currentTab) => {
      if (currentTab !== 'incoming-chats') {
        setUnreadChats((prev) => prev + 1);
      }
      return currentTab;
    });
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Real-time Dashboard</h1>
        <ConnectionStatus />
      </div>
      
      <TabNavigation 
        activeTab={activeTab} 
        onTabChange={handleTabChange}
        unreadLeads={unreadLeads}
        unreadChats={unreadChats}
      />
      
      <div className="dashboard-content">
        <div style={{ display: activeTab === 'new-leads' ? 'block' : 'none' }}>
          <NewLeadsTab onNewLead={incrementUnreadLeads} />
        </div>
        <div style={{ display: activeTab === 'incoming-chats' ? 'block' : 'none' }}>
          <IncomingChatsTab onNewChat={incrementUnreadChats} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
