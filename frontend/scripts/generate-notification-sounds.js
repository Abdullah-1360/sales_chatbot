#!/usr/bin/env node

/**
 * Generate simple notification sound files
 * This script creates minimal MP3 files for notifications
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal valid MP3 file (silence) - Base64 encoded
// This is a very short silent MP3 file that can be used as a placeholder
const SILENT_MP3_BASE64 = 
  'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v////////////////////////////////////////////////////////////////AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAA4T+6DEsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zFGQAAAABpAAAAAAAADSAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

const soundsDir = path.join(__dirname, '..', 'public', 'sounds');

// Ensure sounds directory exists
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Create new-lead.mp3
const newLeadPath = path.join(soundsDir, 'new-lead.mp3');
const newLeadBuffer = Buffer.from(SILENT_MP3_BASE64, 'base64');
fs.writeFileSync(newLeadPath, newLeadBuffer);
console.log('✓ Created new-lead.mp3');

// Create new-chat.mp3 (placeholder)
const newChatPath = path.join(soundsDir, 'new-chat.mp3');
fs.writeFileSync(newChatPath, newLeadBuffer);
console.log('✓ Created new-chat.mp3 (placeholder)');

console.log('\nNote: These are minimal placeholder MP3 files.');
console.log('For better notification sounds, replace them with custom audio files.');
console.log('See frontend/public/sounds/README.md for recommendations.');
