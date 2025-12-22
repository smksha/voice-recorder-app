# Voice Recorder App

A React Native voice recording application built with Expo SDK 52+, React Native 0.76+, and TypeScript.

## Features

- **Recording List Screen**: View all saved recordings with date/time and duration
- **Audio Recording**: Record audio with high-quality settings
- **Playback**: Play and pause saved recordings
- **Local Storage**: Recordings are persisted locally using Expo FileSystem and AsyncStorage
- **Delete Functionality**: Remove unwanted recordings

## Tech Stack

- React Native 0.76+
- Expo SDK 52+
- TypeScript
- Expo AV (for audio recording and playback)
- Expo FileSystem (for file management)
- AsyncStorage (for metadata storage)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the Expo development server:
```bash
npm start
```

3. Run on your preferred platform:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on your device

## Project Structure

```
├── App.tsx                    # Main app component
├── src/
│   ├── screens/
│   │   └── RecordingListScreen.tsx  # Main recording list screen
│   ├── hooks/
│   │   ├── useAudioRecorder.ts     # Audio recording hook
│   │   └── useAudioPlayer.ts        # Audio playback hook
│   ├── services/
│   │   └── recordingService.ts     # Recording storage and management
│   └── types/
│       └── recording.ts             # TypeScript types
├── app.json                   # Expo configuration
└── package.json              # Dependencies and scripts
```

## Usage

1. **Start Recording**: Tap the "Start Recording" button at the bottom of the screen
2. **Stop Recording**: Tap "Stop Recording" to save the recording
3. **Play Recording**: Tap the "Play" button on any recording item
4. **Pause Recording**: Tap "Pause" while a recording is playing
5. **Delete Recording**: Tap the "Delete" button and confirm deletion

## Permissions

The app requires microphone permissions to record audio. These permissions are requested automatically when you start recording.

## Notes

- Recordings are stored in the app's document directory
- Recording metadata (date, time, duration) is stored using AsyncStorage
- Recordings are sorted by date (newest first)
