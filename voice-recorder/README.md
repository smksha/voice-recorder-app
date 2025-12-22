# Voice Recorder App

A professional voice recording app built with React Native 0.81+, TypeScript, and Expo SDK 54.

## Features

- 🎙️ **High-Quality Audio Recording** - Record audio with crystal clear quality
- 📝 **Recording List** - View all your recordings with date, time, and duration
- ▶️ **Playback** - Play back any saved recording
- 🗑️ **Delete Recordings** - Remove unwanted recordings
- 💾 **Persistent Storage** - All recordings are saved locally using Expo FileSystem
- 📱 **Modern UI** - Beautiful, intuitive interface with dark theme

## Tech Stack

- **React Native**: 0.81.5
- **Expo SDK**: 54.0.30
- **TypeScript**: 5.9.2
- **expo-av**: Audio recording and playback
- **expo-file-system**: File management
- **@react-native-async-storage/async-storage**: Metadata storage

## Installation

1. Navigate to the project directory:
```bash
cd voice-recorder
```

2. Install dependencies (already done):
```bash
npm install
```

## Running the App

### Start Development Server
```bash
npm start
```

### Run on Android
```bash
npm run android
```

### Run on iOS (macOS required)
```bash
npm run ios
```

### Run on Web
```bash
npm run web
```

## Project Structure

```
voice-recorder/
├── App.tsx                 # Main app component with UI
├── recordingService.ts     # Recording and playback service classes
├── types.ts               # TypeScript type definitions
├── app.json               # Expo configuration with permissions
└── package.json           # Dependencies
```

## How to Use

1. **Grant Permissions**: On first launch, the app will request microphone permissions
2. **Start Recording**: Tap the red record button at the bottom
3. **Stop Recording**: Tap the button again to stop and save the recording
4. **View Recordings**: All recordings appear in a list with date, time, and duration
5. **Play Recording**: Tap the "Play" button on any recording
6. **Delete Recording**: Tap the "Delete" button and confirm

## Key Components

### RecordingService
Handles audio recording operations:
- Request microphone permissions
- Start/stop recording
- Save recordings to file system
- Manage recording metadata

### PlaybackService
Handles audio playback:
- Play recordings
- Stop playback
- Auto-cleanup after playback

### Storage
- **File Storage**: Audio files stored in `FileSystem.documentDirectory`
- **Metadata Storage**: Recording metadata (date, duration, URI) stored in AsyncStorage
- **File Format**: High-quality audio format (AAC/M4A)

## Permissions

### iOS
- Microphone access for recording audio
- Background audio modes for uninterrupted playback

### Android
- RECORD_AUDIO permission for audio recording

## Building for Production

### Android APK
```bash
eas build -p android --profile preview
```

### iOS IPA
```bash
eas build -p ios --profile preview
```

## Troubleshooting

### Permissions Not Working
- Make sure you've granted microphone permissions in device settings
- Restart the app after granting permissions

### Playback Issues
- Ensure the device volume is turned up
- Check that silent mode is off (iOS)

### Recording Not Saving
- Check device storage space
- Verify app has file system access

## License

MIT

## Support

For issues or questions, please open an issue on the repository.
