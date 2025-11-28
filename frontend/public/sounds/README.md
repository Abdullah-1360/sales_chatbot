# Notification Sounds

This directory contains audio files for notification alerts.

## Current Files

- `new-lead.mp3` - Sound played when a new lead is received (✓ Generated)
- `new-chat.mp3` - Sound played when a new chat message arrives (✓ Placeholder)

## Regenerating Audio Files

To regenerate the placeholder audio files, run:
```bash
node frontend/scripts/generate-notification-sounds.js
```

## Audio File Requirements

- Format: MP3 (recommended) or WAV
- Duration: 1-3 seconds (short and attention-grabbing)
- File size: < 100KB (optimized for web)
- Sample rate: 44.1kHz or 48kHz
- Bit rate: 128kbps or higher

## Adding Custom Sounds

1. Place your audio files in this directory
2. Name them exactly as specified above
3. Ensure files are optimized for web delivery
4. Test in the browser to verify playback

## Fallback Behavior

If audio files are not found, the notification service will:
- Still show browser notifications
- Log a warning in the console
- Continue functioning without audio

## Free Sound Resources

You can find free notification sounds at:
- https://notificationsounds.com/
- https://freesound.org/
- https://mixkit.co/free-sound-effects/notification/

## Testing

To test the sounds:
1. Open the dashboard in your browser
2. Trigger a new lead or chat event
3. Verify the sound plays correctly
4. Check browser console for any errors
