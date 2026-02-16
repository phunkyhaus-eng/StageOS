import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mobileLogin } from '@/lib/api';
import { initOfflineDb } from '@/lib/offline-db';
import { queueEventCreate, useMobileEvents, useMobileSync } from '@/hooks/use-sync';
import { useMobileStore } from '@/store/app-store';

function StageOsMobileApp() {
  const [email, setEmail] = useState('owner@stageos.local');
  const [password, setPassword] = useState('Passw0rd!');
  const [bandInput, setBandInput] = useState('');
  const [eventTitle, setEventTitle] = useState('');

  const token = useMobileStore((s) => s.token);
  const bandId = useMobileStore((s) => s.bandId);
  const pending = useMobileStore((s) => s.pending);
  const conflicts = useMobileStore((s) => s.conflicts);
  const setToken = useMobileStore((s) => s.setToken);
  const setBandId = useMobileStore((s) => s.setBandId);

  const events = useMobileEvents();
  const sync = useMobileSync();

  useEffect(() => {
    void initOfflineDb();
  }, []);

  const loginDisabled = !email || !password;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>StageOS Mobile</Text>
        <Text style={styles.subtitle}>Offline-first touring control center</Text>

        {!token ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#64748b" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor="#64748b" />
            <Pressable
              disabled={loginDisabled}
              style={[styles.button, loginDisabled && styles.buttonDisabled]}
              onPress={async () => {
                const auth = await mobileLogin(email, password);
                setToken(auth.accessToken);
              }}
            >
              <Text style={styles.buttonText}>Sign In</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Band Scope</Text>
              <TextInput
                style={styles.input}
                value={bandInput}
                onChangeText={setBandInput}
                placeholder="Band ID"
                placeholderTextColor="#64748b"
              />
              <Pressable style={styles.buttonGhost} onPress={() => setBandId(bandInput)}>
                <Text style={styles.buttonGhostText}>Set Active Band</Text>
              </Pressable>
              <Text style={styles.muted}>Current: {bandId ?? 'none'}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sync Engine</Text>
              <Text style={styles.muted}>Pending: {pending} • Conflicts: {conflicts}</Text>
              <Pressable style={styles.button} onPress={() => sync.mutate()}>
                <Text style={styles.buttonText}>{sync.isPending ? 'Syncing...' : 'Manual Sync'}</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create Offline Event</Text>
              <TextInput
                style={styles.input}
                value={eventTitle}
                onChangeText={setEventTitle}
                placeholder="Event title"
                placeholderTextColor="#64748b"
              />
              <Pressable
                style={styles.buttonGhost}
                onPress={async () => {
                  if (!bandId || !eventTitle) return;
                  await queueEventCreate({
                    bandId,
                    entityId: `${Date.now()}`,
                    title: eventTitle,
                    startsAt: new Date().toISOString(),
                    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
                  });
                  setEventTitle('');
                }}
              >
                <Text style={styles.buttonGhostText}>Queue Local Write</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Event Cache</Text>
              {(events.data ?? []).map((event) => (
                <View key={String(event.id)} style={styles.row}>
                  <Text style={styles.rowTitle}>{String(event.title)}</Text>
                  <Text style={styles.rowMeta}>{new Date(String(event.startsAt)).toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const queryClient = new QueryClient();

export default function App() {
  const app = useMemo(
    () => (
      <QueryClientProvider client={queryClient}>
        <StageOsMobileApp />
      </QueryClientProvider>
    ),
    []
  );

  return app;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#04070d'
  },
  container: {
    padding: 16,
    gap: 12
  },
  title: {
    color: '#e2e8f0',
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 6
  },
  card: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    backgroundColor: '#0b1220',
    padding: 14,
    gap: 10
  },
  cardTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600'
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    color: '#e2e8f0',
    backgroundColor: '#020617'
  },
  button: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38bdf8'
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: '#020617',
    fontWeight: '700'
  },
  buttonGhost: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#38bdf8'
  },
  buttonGhostText: {
    color: '#7dd3fc',
    fontWeight: '600'
  },
  muted: {
    color: '#94a3b8',
    fontSize: 12
  },
  row: {
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#020617'
  },
  rowTitle: {
    color: '#e2e8f0',
    fontWeight: '600'
  },
  rowMeta: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 3
  }
});
