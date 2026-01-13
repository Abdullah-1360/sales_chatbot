import { useState, useEffect, useCallback } from 'react';
import { fetchChats, deleteChat as deleteChatAPI } from '../services/api';

/**
 * Custom hook for managing chats state
 * Handles initial data fetching, new chat insertion, and sorting
 */
const useChats = () => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetch initial chats from the API
   */
  const loadChats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { chats: fetchedChats } = await fetchChats({
        limit: 50,
        offset: 0,
        sort: '-createdAt', // Descending order (newest first)
      });

      // Sort chats by timestamp descending (newest first)
      const sortedChats = [...fetchedChats].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB - dateA; // Descending order
      });

      // Merge with existing chats to avoid losing WebSocket updates during load
      setChats((prevChats) => {
        if (prevChats.length === 0) {
          // First load, just set the fetched chats
          return sortedChats;
        }
        
        // Merge: keep chats from WebSocket that aren't in fetched data
        const fetchedIds = new Set(sortedChats.map(c => c.id || c._id));
        const newChatsFromWS = prevChats.filter(c => !fetchedIds.has(c.id || c._id));
        
        // Combine and sort
        const combined = [...newChatsFromWS, ...sortedChats];
        return combined.sort((a, b) => {
          const dateA = new Date(a.createdAt);
          const dateB = new Date(b.createdAt);
          return dateB - dateA;
        });
      });
    } catch (err) {
      console.error('Failed to load chats:', err);
      setError(err.message || 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add a new chat to the top of the list or update existing chat
   * Enhanced to handle message updates and User_Ns matching
   * 
   * @param {Object} newChat - The new chat object to add or update
   */
  const addChat = useCallback((newChat) => {
    console.log('🔧 useChats: addChat called with:', newChat);
    
    setChats((prevChats) => {
      console.log('📊 Current chats count:', prevChats.length);
      
      // Check if chat already exists by ID or User_Ns
      const existingChatIndex = prevChats.findIndex((chat) => {
        const chatId = chat.id || chat._id;
        const newChatId = newChat.id || newChat._id;
        
        // Match by ID first
        if (chatId && newChatId && chatId === newChatId) {
          return true;
        }
        
        // Match by User_Ns if both have it
        if (chat.userNs && newChat.userNs && chat.userNs === newChat.userNs) {
          return true;
        }
        
        return false;
      });

      if (existingChatIndex !== -1) {
        // Chat exists - update it
        console.log('🔄 Chat already exists, updating:', prevChats[existingChatIndex].id || prevChats[existingChatIndex].userNs);
        
        const updatedChats = [...prevChats];
        const existingChat = updatedChats[existingChatIndex];
        
        // Handle message appending for same userNs
        let updatedMessages = existingChat.messages || [];
        let isNewMessage = false;
        
        // If new chat has a message and it's different from the last message
        if (newChat.message || newChat.comment || newChat.description) {
          const newMessageText = newChat.message || newChat.comment || newChat.description;
          const lastMessage = updatedMessages.length > 0 ? updatedMessages[updatedMessages.length - 1] : null;
          
          // Check if this is actually a new message (different from last message)
          if (!lastMessage || lastMessage.text !== newMessageText) {
            const newMessageObj = {
              id: Date.now(), // Simple ID generation
              text: newMessageText,
              timestamp: new Date().toISOString()
            };
            
            updatedMessages = [...updatedMessages, newMessageObj];
            isNewMessage = true;
            console.log('📝 New message appended to existing chat');
          }
        }
        
        // If newChat has messages array, merge them
        if (newChat.messages && Array.isArray(newChat.messages)) {
          // Merge messages, avoiding duplicates
          const existingMessageTexts = new Set(updatedMessages.map(m => m.text));
          const newMessages = newChat.messages.filter(m => !existingMessageTexts.has(m.text));
          
          if (newMessages.length > 0) {
            updatedMessages = [...updatedMessages, ...newMessages];
            isNewMessage = true;
            console.log(`📝 ${newMessages.length} new messages merged to existing chat`);
          }
        }
        
        // Merge the chat data, preserving important fields
        updatedChats[existingChatIndex] = {
          ...existingChat,
          ...newChat,
          // Preserve the original createdAt if not provided
          createdAt: newChat.createdAt || existingChat.createdAt,
          // Update lastMessageAt to current time if new message
          lastMessageAt: isNewMessage ? new Date().toISOString() : (newChat.lastMessageAt || existingChat.lastMessageAt),
          // Use updated messages array
          messages: updatedMessages,
          // Update message count
          messageCount: updatedMessages.length,
          // Mark if this is a message update
          isMessageUpdate: isNewMessage
        };
        
        // Re-sort to move updated chat to top based on lastMessageAt
        const sortedChats = updatedChats.sort((a, b) => {
          const dateA = new Date(a.lastMessageAt || a.createdAt);
          const dateB = new Date(b.lastMessageAt || b.createdAt);
          return dateB - dateA; // Descending order
        });
        
        console.log('✅ Chat updated successfully');
        return sortedChats;
      }

      console.log('✨ Adding new chat to list');
      // Insert new chat at the top and maintain sort order
      const initialMessages = [];
      
      // Create initial message from the chat data
      if (newChat.message || newChat.comment || newChat.description) {
        initialMessages.push({
          id: Date.now(),
          text: newChat.message || newChat.comment || newChat.description,
          timestamp: new Date().toISOString()
        });
      }
      
      // Add any existing messages
      if (newChat.messages && Array.isArray(newChat.messages)) {
        initialMessages.push(...newChat.messages);
      }
      
      const newChatWithDefaults = {
        ...newChat,
        lastMessageAt: newChat.lastMessageAt || newChat.createdAt || new Date().toISOString(),
        messageCount: initialMessages.length || 1,
        messages: initialMessages,
        isMessageUpdate: false
      };
      
      const updatedChats = [newChatWithDefaults, ...prevChats];
      
      // Re-sort to ensure proper ordering by lastMessageAt
      const sortedChats = updatedChats.sort((a, b) => {
        const dateA = new Date(a.lastMessageAt || a.createdAt);
        const dateB = new Date(b.lastMessageAt || b.createdAt);
        return dateB - dateA; // Descending order
      });
      
      console.log('✅ New chats count:', sortedChats.length);
      return sortedChats;
    });
  }, []);

  /**
   * Remove a chat from the list and delete from backend
   * @param {Object} chatToRemove - The chat object to remove
   */
  const removeChat = useCallback(async (chatToRemove) => {
    console.log('🗑️ useChats: removeChat called with:', chatToRemove);
    
    const chatId = chatToRemove.id || chatToRemove._id;
    
    // Optimistically remove from UI first
    setChats((prevChats) => {
      const filteredChats = prevChats.filter((chat) => {
        const currentChatId = chat.id || chat._id;
        return currentChatId !== chatId;
      });
      
      console.log('✅ Chat removed from UI. New count:', filteredChats.length);
      return filteredChats;
    });
    
    // Delete from backend
    try {
      await deleteChatAPI(chatId);
      console.log('✅ Chat deleted from backend:', chatId);
    } catch (error) {
      console.error('❌ Failed to delete chat from backend:', error);
      // Optionally: re-add the chat to the list if backend deletion fails
      // For now, we keep it removed from UI even if backend fails
    }
  }, []);

  /**
   * Refresh chats list
   */
  const refreshChats = useCallback(() => {
    loadChats();
  }, [loadChats]);

  // Load chats on mount
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  return {
    chats,
    loading,
    error,
    addChat,
    removeChat,
    refreshChats,
  };
};

export default useChats;
