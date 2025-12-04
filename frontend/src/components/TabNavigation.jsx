import '../styles/TabNavigation.css';

function TabNavigation({ activeTab, onTabChange, unreadLeads = 0, unreadChats = 0 }) {
  const tabs = [
    { id: 'incoming-chats', label: 'Incoming Chats', unreadCount: unreadChats },
    { id: 'new-leads', label: 'New Leads', unreadCount: unreadLeads }
  ];

  return (
    <div className="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-selected={activeTab === tab.id}
          role="tab"
        >
          <span className="tab-label">{tab.label}</span>
          {tab.unreadCount > 0 && (
            <span className="tab-badge">
              {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default TabNavigation;
