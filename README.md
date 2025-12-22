# Voice Recorder (Expo + React Native + TypeScript)

## Setup

```bash
npm install
```

## Run

```bash
npm run start
```

Then run on a device/emulator (recommended for recording):

- `npm run android`
- `npm run ios`

## What’s implemented

- Record audio (mic permission required)
- Persist recordings locally (audio files in app storage via `expo-file-system`, metadata via AsyncStorage)
- Recordings list shows **date/time** + **duration**
- Play/stop saved recordings

