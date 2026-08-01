import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as AuthSession from 'expo-auth-session';
import { CLIENT_ID, DISCOVERY, SCOPES } from './src/auth/config';
import { currentAccessToken, exchangeCode, redirectUri, signOut } from './src/auth/session';
import { apiGet, describeFailure, type ApiFailure } from './src/api/client';

/**
 * AutoWorkshop mobile — the first screen, Android first.
 *
 * `COMBINED_PLAN_v2.md` §157 fixes the stack (React Native + Expo, Android
 * first) and schedules the mobile app in Phase 10. The owner pulled it forward,
 * so this is the FOUNDATION and the first working loop, not the finished app:
 * sign in through Keycloak with PKCE, hold the tokens in the Android Keystore,
 * call the real API, and render what a technician actually opens — their job
 * cards.
 *
 * ⚠️ IT CALLS THE SAME API AS THE WEB APPS, WITH THE SAME GUARDS. There is no
 * mobile-specific endpoint, no mobile bypass, and no second authorization model.
 * `TenantGuard` resolves the tenant from validated Keycloak claims and
 * membership exactly as it does for a browser, and row-level security applies
 * underneath. A phone is a different client, not a different trust level.
 *
 * ⚠️ WHAT THIS DELIBERATELY IS NOT, YET: no offline queue (`packages/offline-sync`
 * is still an empty directory), no navigation stack, no camera capture, no push.
 * Those are Phase 10's substance and each is a slice of its own. Shipping a
 * convincing-looking shell over mock data is what `05.txt` §2 prohibits, so this
 * screen shows real rows or an honest failure and nothing in between.
 */

interface JobCard {
  id: string;
  jobNumber?: string;
  job_number?: string;
  status?: string;
  stage?: string;
  vehicleRegistration?: string;
  vehicle_registration?: string;
}

type Screen =
  | { kind: 'checking' }
  | { kind: 'signedOut'; message?: string }
  | { kind: 'loading' }
  | { kind: 'ready'; jobs: JobCard[] }
  | { kind: 'failed'; reason: ApiFailure };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'checking' });
  const [refreshing, setRefreshing] = useState(false);

  // ⚠️ `usePKCE: true` STATED EXPLICITLY, though it is the library default.
  // This is the control that makes a public client safe (RFC 8252), and a
  // default is a thing that can change in a minor release. The realm requires
  // S256, so if this were ever off Keycloak would refuse the request outright
  // rather than falling back — but the intent belongs in the code that asks.
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    { clientId: CLIENT_ID, scopes: SCOPES, redirectUri, usePKCE: true },
    DISCOVERY,
  );

  const loadJobs = useCallback(async () => {
    const result = await apiGet<JobCard[] | { items: JobCard[] }>('/api/v1/job-cards');
    if (!result.ok) {
      if (result.reason.kind === 'unauthenticated') {
        setScreen({ kind: 'signedOut' });
      } else {
        setScreen({ kind: 'failed', reason: result.reason });
      }
      return;
    }
    // ⚠️ ACCEPTS EITHER SHAPE. `verify-directory-optin.mjs` recorded the cost of
    // assuming one: an endpoint returned a bare array while the helper read
    // `.items`, so every assertion was silently empty and one "passed" by
    // finding nothing. Normalising here means a shape change degrades to an
    // empty list rather than to a crash — and the empty state says so.
    const data = result.data;
    setScreen({ kind: 'ready', jobs: Array.isArray(data) ? data : (data.items ?? []) });
  }, []);

  // On launch: is there a usable session already? `currentAccessToken` refreshes
  // silently if the access token has expired, so a returning user does not see
  // a sign-in screen they do not need.
  useEffect(() => {
    void (async () => {
      const token = await currentAccessToken();
      if (!token) {
        setScreen({ kind: 'signedOut' });
        return;
      }
      setScreen({ kind: 'loading' });
      await loadJobs();
    })();
  }, [loadJobs]);

  const onSignIn = useCallback(async () => {
    if (!request) return;
    const result = await promptAsync();
    if (result.type !== 'success' || !result.params['code']) {
      // Dismissing the browser is a normal user action, not an error worth
      // shouting about. Only a genuine failure carries a message.
      setScreen({
        kind: 'signedOut',
        message: result.type === 'error' ? 'Sign-in did not complete. Please try again.' : undefined,
      });
      return;
    }
    setScreen({ kind: 'loading' });
    const exchanged = await exchangeCode(request, String(result.params['code']));
    if (!exchanged.ok) {
      setScreen({ kind: 'signedOut', message: exchanged.message });
      return;
    }
    await loadJobs();
  }, [request, promptAsync, loadJobs]);

  const onSignOut = useCallback(async () => {
    setScreen({ kind: 'checking' });
    await signOut();
    setScreen({ kind: 'signedOut' });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  }, [loadJobs]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.title}>AutoWorkshop</Text>
        {(screen.kind === 'ready' || screen.kind === 'failed') && (
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            // 44dp is the minimum comfortable touch target, and this app is used
            // with workshop gloves on.
            hitSlop={12}
            style={styles.signOut}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        )}
      </View>
      <Body screen={screen} onSignIn={onSignIn} canSignIn={Boolean(request)} refreshing={refreshing} onRefresh={onRefresh} />
    </SafeAreaView>
  );
}

function Body({
  screen,
  onSignIn,
  canSignIn,
  refreshing,
  onRefresh,
}: {
  screen: Screen;
  onSignIn: () => void;
  canSignIn: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  // Every state is rendered. `05.txt` §2 requires loading, empty AND error
  // states per module, and this is the module.
  if (screen.kind === 'checking' || screen.kind === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>
          {screen.kind === 'checking' ? 'Checking your session…' : 'Loading your job cards…'}
        </Text>
      </View>
    );
  }

  if (screen.kind === 'signedOut') {
    return (
      <View style={styles.centre}>
        <Text style={styles.heading}>Sign in to continue</Text>
        <Text style={styles.muted}>
          You will sign in with your workshop account in your browser, then come back here.
        </Text>
        {screen.message ? <Text style={styles.error}>{screen.message}</Text> : null}
        <Pressable
          onPress={onSignIn}
          disabled={!canSignIn}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSignIn }}
          style={[styles.button, !canSignIn && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{canSignIn ? 'Sign in' : 'Preparing…'}</Text>
        </Pressable>
      </View>
    );
  }

  if (screen.kind === 'failed') {
    const { title, detail } = describeFailure(screen.reason);
    return (
      <View style={styles.centre}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
        <Pressable onPress={onRefresh} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (screen.jobs.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.heading}>No job cards</Text>
        <Text style={styles.muted}>
          Nothing is assigned to you in this workshop yet. Pull down to check again.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={screen.jobs}
      keyExtractor={(j) => j.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => (
        <View style={styles.card} accessible accessibilityRole="summary">
          <Text style={styles.cardTitle}>
            {item.jobNumber ?? item.job_number ?? item.id.slice(0, 8)}
          </Text>
          <Text style={styles.muted}>
            {item.vehicleRegistration ?? item.vehicle_registration ?? 'Vehicle not recorded'}
          </Text>
          <Text style={styles.badge}>{item.stage ?? item.status ?? 'unknown stage'}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0f14' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#243040',
  },
  title: { color: '#e6edf3', fontSize: 20, fontWeight: '700' },
  signOut: { paddingVertical: 8, paddingHorizontal: 12 },
  signOutText: { color: '#7fb3ff', fontSize: 15 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  heading: { color: '#e6edf3', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  muted: { color: '#8b98a5', fontSize: 15, textAlign: 'center', lineHeight: 21 },
  error: { color: '#ff8080', fontSize: 15, textAlign: 'center' },
  button: {
    marginTop: 8,
    backgroundColor: '#1f6feb',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    minWidth: 180,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#30363d' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#111823',
    borderRadius: 10,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#243040',
    gap: 4,
  },
  cardTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '600' },
  badge: { color: '#7fb3ff', fontSize: 13, marginTop: 4 },
});
