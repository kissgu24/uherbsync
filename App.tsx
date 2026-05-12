import { useState, useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { CategoriesProvider } from './contexts/CategoriesContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { i18n } from './i18n';
import { initDB, getSetting } from './db/db';
import { initNotificationChannelAsync } from './services/notificationService';

export const navigationRef = createNavigationContainerRef<Record<string, undefined>>();

const isExpoGo = Constants.appOwnership === 'expo';

import DashboardScreen from './screens/DashboardScreen';
import ReplenishScreen from './screens/ReplenishScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import RecordScreen from './screens/RecordScreen';
import SettingsScreen from './screens/SettingsScreen';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  dashboard: { active: 'pulse',          inactive: 'pulse-outline' },
  replenish: { active: 'cart',           inactive: 'cart-outline' },
  analysis:  { active: 'bar-chart',      inactive: 'bar-chart-outline' },
  record:    { active: 'document-text',  inactive: 'document-text-outline' },
  settings:  { active: 'settings',       inactive: 'settings-outline' },
};

function AppContent() {
  const { language } = useLanguage();
  const responseListenerRef = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | null>(null);

  useEffect(() => {
    if (isExpoGo) return;
    (async () => {
      try {
        const enabled = await getSetting('notifications_enabled');
        if (enabled !== 'false') {
          await Notifications.requestPermissionsAsync();
        }
        await initNotificationChannelAsync();
      } catch {}
    })();

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('dashboard');
      }
    });

    return () => {
      responseListenerRef.current?.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#161B22',
              borderTopColor: '#30363D',
              borderTopWidth: 1,
              height: 62,
              paddingBottom: 10,
              paddingTop: 6,
            },
            tabBarActiveTintColor: '#4D9EFF',
            tabBarInactiveTintColor: '#8B949E',
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            tabBarIcon: ({ color, size, focused }) => {
              const icons = TAB_ICONS[route.name];
              return (
                <Ionicons
                  name={focused ? icons.active : icons.inactive}
                  size={size}
                  color={color}
                />
              );
            },
          })}
        >
          <Tab.Screen
            name="dashboard"
            component={DashboardScreen}
            options={{ tabBarLabel: i18n.t('tabs.dashboard') }}
          />
          <Tab.Screen
            name="replenish"
            component={ReplenishScreen}
            options={{
              tabBarLabel: i18n.t('tabs.replenish'),
              tabBarLabelStyle: { fontSize: 9, fontWeight: '600' },
            }}
          />
          <Tab.Screen
            name="analysis"
            component={AnalysisScreen}
            options={{ tabBarLabel: i18n.t('tabs.analysis') }}
          />
          <Tab.Screen
            name="record"
            component={RecordScreen}
            options={{
              tabBarLabel: i18n.t('tabs.record'),
              tabBarLabelStyle: { fontSize: 9, fontWeight: '600' },
            }}
          />
          <Tab.Screen
            name="settings"
            component={SettingsScreen}
            options={{ tabBarLabel: i18n.t('tabs.settings') }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDB().then(() => setDbReady(true));
  }, []);

  if (!dbReady) return null;

  return (
    <SafeAreaProvider>
      <CategoriesProvider>
        <LanguageProvider>
          <AppContent />
        </LanguageProvider>
      </CategoriesProvider>
    </SafeAreaProvider>
  );
}
