import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// Extend dayjs with relativeTime plugin
dayjs.extend(relativeTime);

/**
 * Format a timestamp to relative time (e.g., "2 minutes ago")
 * Requirement 6.4: Display timestamps in human-readable format
 * 
 * @param {string|Date|number} timestamp - The timestamp to format
 * @returns {string} Formatted relative time string
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) {
    return 'Unknown time';
  }

  try {
    const date = dayjs(timestamp);
    
    // Check if date is valid
    if (!date.isValid()) {
      return 'Invalid date';
    }

    const now = dayjs();
    const diffInSeconds = now.diff(date, 'second');
    const diffInMinutes = now.diff(date, 'minute');
    const diffInHours = now.diff(date, 'hour');
    const diffInDays = now.diff(date, 'day');

    // Handle edge cases for more precise formatting
    if (diffInSeconds < 10) {
      return 'Just now';
    } else if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInMinutes < 60) {
      return diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`;
    } else if (diffInHours < 24) {
      return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
    } else if (diffInDays < 7) {
      return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
    } else {
      // For older dates, show the actual date
      return date.format('MMM D, YYYY');
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

/**
 * Format a timestamp to a full date string
 * 
 * @param {string|Date|number} timestamp - The timestamp to format
 * @param {string} format - The format string (default: 'MMM D, YYYY h:mm A')
 * @returns {string} Formatted date string
 */
export const formatFullDate = (timestamp, format = 'MMM D, YYYY h:mm A') => {
  if (!timestamp) {
    return 'Unknown date';
  }

  try {
    const date = dayjs(timestamp);
    
    if (!date.isValid()) {
      return 'Invalid date';
    }

    return date.format(format);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

export default {
  formatRelativeTime,
  formatFullDate,
};
