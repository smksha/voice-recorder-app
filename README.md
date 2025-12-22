# Voice Recorder App

This is a Voice Recorder app built with React Native (0.76+), Expo (SDK 52+), and TypeScript.

## Features

- **Recording List Screen**: Displays a list of all existing recordings.
- **Recording Details**: Shows date, time, and duration for each recording.
- **Persistence**: Recordings are saved locally using `expo-file-system` and metadata is stored in `AsyncStorage`.
- **Playback**: Allows playback of saved recordings.

## Getting Started

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Run the app:
    ```bash
    npm start
    ```

3.  Use Expo Go on your device or an emulator to run the app.

## Project Structure

- `App.tsx`: Main entry point containing all logic for recording, playback, and persistence.
- `package.json`: Dependencies and scripts.
