---
inclusion: fileMatch
fileMatchPattern: frontend/**/*
---

# Frontend React Patterns & Guidelines

## Project Structure
```
frontend/src/
  /components   - React UI components
  /hooks        - Custom React hooks
  /services     - API clients and external services
  /styles       - Component-specific CSS files
  /utils        - Helper functions
  config.js     - Frontend configuration
  main.jsx      - Application entry point
  App.jsx       - Root component
```

## Component Patterns

### Functional Components (Always)
```javascript
// Use arrow functions for components
export const ComponentName = ({ prop1, prop2 }) => {
  const [state, setState] = useState(initialValue);
  
  useEffect(() => {
    // Side effects
    return () => {
      // Cleanup
    };
  }, [dependencies]);
  
  return (
    <div className="component-name">
      {/* JSX */}
    </div>
  );
};
```

### Component File Structure
```javascript
// 1. Imports
import { useState, useEffect } from 'react';
import { useCustomHook } from '../hooks/useCustomHook';
import './ComponentName.css';

// 2. Component definition
export const ComponentName = ({ props }) => {
  // 3. Hooks (always at top, same order)
  const [state, setState] = useState();
  const customData = useCustomHook();
  
  // 4. Event handlers
  const handleClick = () => {
    // Handler logic
  };
  
  // 5. Effects
  useEffect(() => {
    // Effect logic
  }, [deps]);
  
  // 6. Render helpers (if needed)
  const renderItem = (item) => (
    <div key={item.id}>{item.name}</div>
  );
  
  // 7. Return JSX
  return (
    <div className="component-name">
      {/* JSX */}
    </div>
  );
};
```

## Custom Hooks Pattern

### Hook Naming
- Always prefix with `use`: `useChats`, `useWebSocket`, `useNotifications`
- Be specific about what the hook does

### Hook Structure
```javascript
// hooks/useChats.js
import { useState, useEffect } from 'react';
import { fetchChats } from '../services/api';
import socket from '../services/websocket';

export const useChats = () => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    loadChats();
    
    // WebSocket listener
    socket.on('new-chat', handleNewChat);
    
    return () => {
      socket.off('new-chat', handleNewChat);
    };
  }, []);
  
  const loadChats = async () => {
    try {
      setLoading(true);
      const data = await fetchChats();
      setChats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleNewChat = (newChat) => {
    setChats(prev => [newChat, ...prev]);
  };
  
  return { chats, loading, error, refresh: loadChats };
};
```

## State Management

### Local State (useState)
Use for component-specific state:
```javascript
const [isOpen, setIsOpen] = useState(false);
const [formData, setFormData] = useState({ name: '', email: '' });
```

### Derived State
Compute from existing state, don't store separately:
```javascript
// ❌ Bad - storing derived state
const [items, setItems] = useState([]);
const [itemCount, setItemCount] = useState(0);

// ✅ Good - compute on render
const [items, setItems] = useState([]);
const itemCount = items.length;
```

### State Updates
```javascript
// For objects - spread and update
setFormData(prev => ({ ...prev, name: 'New Name' }));

// For arrays - spread and add
setItems(prev => [...prev, newItem]);

// For arrays - filter to remove
setItems(prev => prev.filter(item => item.id !== removeId));

// For arrays - map to update
setItems(prev => prev.map(item => 
  item.id === updateId ? { ...item, ...updates } : item
));
```

## API Integration

### Service Layer Pattern
```javascript
// services/api.js
import axios from 'axios';
import { API_BASE_URL } from '../config';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Response interceptor for error handling
api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error);
    throw error;
  }
);

export const fetchChats = () => api.get('/api/chats');
export const createChat = (data) => api.post('/api/chats', data);
export const updateChat = (id, data) => api.put(`/api/chats/${id}`, data);
export const deleteChat = (id) => api.delete(`/api/chats/${id}`);
```

### Using in Components
```javascript
import { fetchChats, createChat } from '../services/api';

const MyComponent = () => {
  const [chats, setChats] = useState([]);
  
  useEffect(() => {
    loadChats();
  }, []);
  
  const loadChats = async () => {
    try {
      const data = await fetchChats();
      setChats(data);
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  };
  
  const handleCreate = async (chatData) => {
    try {
      const newChat = await createChat(chatData);
      setChats(prev => [newChat, ...prev]);
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };
  
  return (/* JSX */);
};
```

## Styling Guidelines

### CSS Modules Approach
Each component has its own CSS file:
```
ComponentName.jsx
ComponentName.css
```

### CSS Class Naming (BEM-like)
```css
/* ComponentName.css */
.component-name {
  /* Container styles */
}

.component-name__element {
  /* Element styles */
}

.component-name--modifier {
  /* Modifier styles */
}

.component-name__element--modifier {
  /* Element with modifier */
}
```

### Example
```javascript
// ChatCard.jsx
<div className="chat-card">
  <div className="chat-card__header">
    <h3 className="chat-card__title">{title}</h3>
  </div>
  <div className="chat-card__body">
    <p className="chat-card__message">{message}</p>
  </div>
  <div className={`chat-card__status ${isRead ? 'chat-card__status--read' : ''}`}>
    {status}
  </div>
</div>
```

## Performance Optimization

### Memoization
```javascript
import { useMemo, useCallback } from 'react';

// Memoize expensive computations
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}, [items]);

// Memoize callbacks passed to children
const handleClick = useCallback((id) => {
  console.log('Clicked:', id);
}, []);
```

### Conditional Rendering
```javascript
// ✅ Good - early return
if (loading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!data) return null;

return <DataDisplay data={data} />;

// ✅ Good - ternary for simple cases
return isVisible ? <Component /> : null;

// ✅ Good - && for conditional rendering
return (
  <div>
    {showHeader && <Header />}
    <Content />
  </div>
);
```

### List Rendering
```javascript
// Always use key prop
{items.map(item => (
  <ItemCard key={item.id} item={item} />
))}

// ❌ Bad - using index as key (only if list never changes)
{items.map((item, index) => (
  <ItemCard key={index} item={item} />
))}
```

## Event Handling

### Inline vs Named Handlers
```javascript
// ✅ Good - named handler for complex logic
const handleSubmit = (e) => {
  e.preventDefault();
  // Complex logic
};

<form onSubmit={handleSubmit}>

// ✅ Good - inline for simple cases
<button onClick={() => setIsOpen(false)}>Close</button>

// ❌ Bad - inline with complex logic
<button onClick={() => {
  // Many lines of logic
}}>
```

### Passing Arguments
```javascript
// ✅ Good - arrow function wrapper
<button onClick={() => handleDelete(item.id)}>Delete</button>

// ✅ Good - curried function
const handleDelete = (id) => () => {
  deleteItem(id);
};
<button onClick={handleDelete(item.id)}>Delete</button>
```

## Form Handling

### Controlled Components
```javascript
const [formData, setFormData] = useState({
  name: '',
  email: '',
  message: ''
});

const handleChange = (e) => {
  const { name, value } = e.target;
  setFormData(prev => ({ ...prev, [name]: value }));
};

const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    await submitForm(formData);
    setFormData({ name: '', email: '', message: '' }); // Reset
  } catch (error) {
    console.error('Submit failed:', error);
  }
};

return (
  <form onSubmit={handleSubmit}>
    <input
      name="name"
      value={formData.name}
      onChange={handleChange}
      required
    />
    <input
      name="email"
      type="email"
      value={formData.email}
      onChange={handleChange}
      required
    />
    <textarea
      name="message"
      value={formData.message}
      onChange={handleChange}
    />
    <button type="submit">Submit</button>
  </form>
);
```

## Error Boundaries

### Create Error Boundary Component
```javascript
// components/ErrorBoundary.jsx
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

### Usage
```javascript
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

## Best Practices

### 1. Component Size
- Keep components under 200 lines
- Extract complex logic into custom hooks
- Split large components into smaller ones

### 2. Props
- Destructure props in function signature
- Use PropTypes or TypeScript for type checking
- Provide default values for optional props

### 3. Dependencies
- Always specify useEffect dependencies correctly
- Use ESLint exhaustive-deps rule
- Extract functions outside component if they don't need closure

### 4. Cleanup
- Always cleanup in useEffect return
- Remove event listeners
- Cancel pending requests
- Clear timers/intervals

### 5. Accessibility
- Use semantic HTML elements
- Add aria-labels for screen readers
- Ensure keyboard navigation works
- Maintain proper heading hierarchy

### 6. Testing
- Test user interactions, not implementation
- Mock API calls and WebSocket connections
- Test error states and loading states
- Use React Testing Library

## Common Pitfalls

### ❌ Avoid
```javascript
// Mutating state directly
state.push(item); // Wrong!

// Missing dependencies in useEffect
useEffect(() => {
  doSomething(prop);
}, []); // Missing prop dependency

// Creating functions in render
{items.map(item => <Item onClick={() => handle(item)} />)}

// Inline object/array in props
<Component style={{ margin: 10 }} />
```

### ✅ Do
```javascript
// Immutable state updates
setState(prev => [...prev, item]);

// Complete dependencies
useEffect(() => {
  doSomething(prop);
}, [prop]);

// Memoized callbacks
const handleClick = useCallback((item) => handle(item), []);

// Memoized objects
const style = useMemo(() => ({ margin: 10 }), []);
```
