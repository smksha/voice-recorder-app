import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, FlatList, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const RECORDINGS_STORAGE_KEY = 'voice_recordings_v1';

interface RecordingMetadata {
  id: string;
  uri: string;
  date: string; // ISO string
  durationMillis: number;
  name: string;
}

export default function App() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordings, setRecordings] = useState<RecordingMetadata[]>([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  useEffect(() => {
    loadRecordings();
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    }).catch(err => console.error('Failed to set audio mode', err));

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const loadRecordings = async () => {
    try {
      const savedRecordings = await AsyncStorage.getItem(RECORDINGS_STORAGE_KEY);
      if (savedRecordings) {
        setRecordings(JSON.parse(savedRecordings));
      }
    } catch (error) {
      console.error('Failed to load recordings', error);
      Alert.alert('Error', 'Failed to load recordings');
    }
  };

  const saveRecordings = async (newRecordings: RecordingMetadata[]) => {
    try {
      await AsyncStorage.setItem(RECORDINGS_STORAGE_KEY, JSON.stringify(newRecordings));
      setRecordings(newRecordings);
    } catch (error) {
      console.error('Failed to save recordings', error);
      Alert.alert('Error', 'Failed to save recording metadata');
    }
  };

  async function startRecording() {
    try {
      if (permissionResponse?.status !== 'granted') {
        console.log('Requesting permission..');
        const permission = await requestPermission();
        if (permission.status !== 'granted') {
            Alert.alert('Permission needed', 'Microphone permission is required to record audio.');
            return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('Starting recording..');
      const { recording } = await Audio.Recording.createAsync(
         Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  }

  async function stopRecording() {
    console.log('Stopping recording..');
    if (!recording) return;

    setRecording(null);
    try {
      const status = await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      console.log('Recording stopped and stored at', uri);

      if (!uri) return;

      const { durationMillis } = status;
      
      // Move file to permanent location
      const fileName = `recording-${Date.now()}.m4a`;
      const newUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.moveAsync({
        from: uri,
        to: newUri
      });

      const newRecording: RecordingMetadata = {
        id: Date.now().toString(),
        uri: newUri,
        date: new Date().toISOString(),
        durationMillis: durationMillis,
        name: `Recording ${recordings.length + 1}`
      };

      const updatedRecordings = [newRecording, ...recordings];
      await saveRecordings(updatedRecordings);

    } catch (error) {
       console.error('Failed to stop recording', error);
       Alert.alert('Error', 'Failed to stop and save recording');
    }
  }

  async function playSound(uri: string) {
    console.log('Loading Sound', uri);
    try {
        if (sound) {
            await sound.unloadAsync();
            setSound(null);
            setPlayingUri(null);
            
            // If clicking the same item, just stop it (toggle behavior)
            if (playingUri === uri) {
                return;
            }
        }

        const { sound: newSound } = await Audio.Sound.createAsync({ uri });
        setSound(newSound);
        setPlayingUri(uri);

        console.log('Playing Sound');
        await newSound.playAsync();

        newSound.setOnPlaybackStatusUpdate(async (status) => {
            if (status.isLoaded && status.didJustFinish) {
                setPlayingUri(null);
                setSound(null);
                await newSound.unloadAsync();
            }
        });

    } catch (error) {
        console.error('Error playing sound', error);
        Alert.alert('Error', 'Could not play audio file');
    }
  }

  const formatDuration = (millis: number) => {
    const minutes = Math.floor(millis / 1000 / 60);
    const seconds = Math.round((millis / 1000) % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const formatDate = (isoString: string) => {
      return new Date(isoString).toLocaleString();
  };

  const renderItem = ({ item }: { item: RecordingMetadata }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
        <Text style={styles.itemDuration}>{formatDuration(item.durationMillis)}</Text>
      </View>
      <TouchableOpacity 
        style={styles.playButton} 
        onPress={() => playSound(item.uri)}
      >
        <Text style={styles.playButtonText}>
            {playingUri === item.uri ? 'Stop' : 'Play'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.title}>Voice Recorder</Text>
      </View>
      
      <View style={styles.listContainer}>
        {recordings.length === 0 ? (
            <Text style={styles.emptyText}>No recordings yet</Text>
        ) : (
            <FlatList
                data={recordings}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
            />
        )}
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.recordButton, recording ? styles.recordingButton : null]}
          onPress={recording ? stopRecording : startRecording}
        >
          <Text style={styles.recordButtonText}>
            {recording ? 'Stop Recording' : 'Start Recording'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  listContent: {
    paddingBottom: 100, // Space for button
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    color: '#888',
  },
  itemContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 4,
  },
  itemDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  itemDuration: {
    fontSize: 12,
    color: '#444',
    fontWeight: '500',
  },
  playButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 10,
  },
  playButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  recordingButton: {
    backgroundColor: '#333',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
