// utils/sanitizeString.js

// Simple string sanitization function
const sanitizeString = (input) => {
    if (typeof input !== 'string' || input.trim() === '') {
      return false;
    }
    // Remove potentially malicious characters (basic sanitization)
    const sanitized = input.trim().replace(/[<>{}]/g, '');
    return sanitized.length > 0 ? sanitized : false;
  };
  
  module.exports = sanitizeString;