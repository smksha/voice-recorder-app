# Voice Recorder App

A React Native voice recorder application built with Expo SDK 52 and TypeScript.

## Features

### Recordings List Screen
- ✅ Show a list of all existing recordings
- ✅ Each item displays:
  - Date & Time of initiation
  - Recording duration
- ✅ Persist recordings locally using Expo FileSystem and AsyncStorage
- ✅ Allow playback of any saved recording with play/pause/stop controls
- ✅ Progress bar showing playback position
- ✅ Delete recordings with confirmation

### New Recording Screen
- ✅ Single "Start Recording" button to initiate recording
- ✅ While recording:
  - Display elapsed time
  - Animated waveform visualization
  - "Stop Recording" button (tap main button)
  - "Pause/Resume" button
- ✅ On stop, save the recording with timestamp and duration

### Background Resilience
- ✅ Recording continues when phone goes to sleep (background audio mode enabled)
- ✅ If interrupted by phone call:
  - Recording automatically pauses
  - Automatically resumes when call ends
- ✅ If app is backgrounded (user switches apps):
  - Recording pauses
  - 3-second grace period to return and resume
  - After 3 seconds, recording is saved automatically
- ✅ If app is killed:
  - Recording is saved (if backgrounded for >3 seconds before kill)
  - Note: iOS limitation - if killed within 3 seconds of backgrounding, recording may be lost

## Tech Stack

- **Expo SDK**: ~52.0.0
- **React Native**: 0.76.9
- **TypeScript**: ~5.3.3
- **expo-av**: Audio recording and playback
- **expo-file-system**: Local file storage
- **@react-native-async-storage/async-storage**: Metadata persistence

## Project Structure

```
src/
├── components/
│   ├── common/
│   │   ├── IconButton.tsx      # Reusable icon button
│   │   ├── Card.tsx            # Reusable card container
│   │   ├── ProgressBar.tsx     # Reusable progress bar
│   │   └── index.ts
│   ├── EmptyState.tsx          # Empty list placeholder
│   ├── RecordButton.tsx        # Main record button with controls
│   ├── RecordingItem.tsx       # Recording list item
│   ├── Waveform.tsx            # Animated waveform visualization
│   └── index.ts
├── screens/
│   ├── HomeScreen.tsx          # Main screen
│   └── index.ts
├── styles/
│   ├── colors.ts               # Color palette
│   ├── spacing.ts              # Spacing & border radius
│   ├── typography.ts           # Text styles
│   ├── shadows.ts              # Shadow presets
│   └── index.ts
├── hooks/
│   ├── useRecordings.ts        # Recording management hook
│   └── useAudioPlayer.ts       # Playback management hook
├── types/
│   └── Recording.ts            # TypeScript interfaces
└── utils/
    ├── storage.ts              # AsyncStorage & FileSystem utilities
    └── formatters.ts           # Date/time & duration formatters
```

## Installation

```bash
# Clone the repository
git clone https://github.com/smksha/voice-recorder-app.git
cd voice-recorder-app/voice-recorder

# Install dependencies
npm install

# Start the development server
npm start
```

## Running on Device

### iOS (requires Mac with Xcode)

```bash
# Generate native iOS project
npx expo prebuild

# Run on connected iPhone
npx expo run:ios --device
```

### Android

```bash
# Generate native Android project
npx expo prebuild

# Run on connected Android device
npx expo run:android --device
```

### Expo Go (Development)

```bash
npm start
```
Scan the QR code with your device camera to open in Expo Go app.

## Permissions

The app requires the following permissions:

### iOS
- `NSMicrophoneUsageDescription`: Microphone access for recording
- `UIBackgroundModes`: Audio background mode for continued recording

### Android
- `android.permission.RECORD_AUDIO`: Microphone access
- `android.permission.MODIFY_AUDIO_SETTINGS`: Audio settings control

## Architecture

### Recording Flow
1. User taps record button
2. `useRecordings` hook requests microphone permission
3. Audio mode is configured for recording
4. Recording starts with `expo-av`
5. Duration timer updates every 100ms
6. Waveform animates based on recording state
7. On stop, recording is saved to FileSystem
8. Metadata is persisted to AsyncStorage

### Background Handling
1. **Phone Call Detection**: Recording status callback detects audio interruption
2. **App Backgrounding**: AppState listener detects background/foreground transitions
3. **Auto-save Timer**: 3-second timer saves recording if user doesn't return
4. **Auto-resume**: Recording resumes automatically when returning from phone call

### Playback Flow
1. User taps play on a recording
2. `useAudioPlayer` hook loads the audio file
3. Playback status updates position in real-time
4. Progress bar reflects current position
5. User can pause, resume, or stop playback

## Known Limitations

1. **iOS Kill Protection**: If the app is killed within 3 seconds of being backgrounded, the recording may be lost. This is an iOS limitation as the system doesn't notify apps when they're being terminated.

2. **Background Recording Duration**: iOS may eventually suspend the app if it's in the background for too long, even with background audio mode enabled.

## License

MIT
