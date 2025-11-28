import '../styles/TabNavigation.css';

function TabNavigation({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'incoming-chats', label: 'Incoming Chats' },
    { id: 'new-leads', label: 'New Leads' }
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
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default TabNavigation;
