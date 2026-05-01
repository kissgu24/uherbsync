import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { CategoriesProvider } from './contexts/CategoriesContext';
import { getSetting } from './db/db';

const isExpoGo = Constants.appOwnership === 'expo';

import DashboardScreen from './screens/DashboardScreen';
import ReplenishScreen from './screens/ReplenishScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import RecordScreen from './screens/RecordScreen';
import SettingsScreen from './screens/SettingsScreen';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  '能量水位': { active: 'pulse', inactive: 'pulse-outline' },
  '登錄/匯入': { active: 'cart', inactive: 'cart-outline' },
  '分析':    { active: 'bar-chart', inactive: 'bar-chart-outline' },
  '歷史記錄': { active: 'document-text', inactive: 'document-text-outline' },
  '設定':    { active: 'settings', inactive: 'settings-outline' },
};

export default function App() {
  useEffect(() => {
    if (isExpoGo) return;
    (async () => {
      try {
        const enabled = await getSetting('notifications_enabled');
        if (enabled !== 'false') {
          await Notifications.requestPermissionsAsync();
        }
      } catch {}
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <CategoriesProvider>
      <StatusBar style="light" />
      <NavigationContainer>
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
          <Tab.Screen name="能量水位" component={DashboardScreen} />
          <Tab.Screen name="登錄/匯入" component={ReplenishScreen} options={{ tabBarLabelStyle: { fontSize: 9, fontWeight: '600' } }} />
          <Tab.Screen name="分析"    component={AnalysisScreen} />
          <Tab.Screen name="歷史記錄" component={RecordScreen} options={{ tabBarLabelStyle: { fontSize: 9, fontWeight: '600' } }} />
          <Tab.Screen name="設定"    component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
      </CategoriesProvider>
    </SafeAreaProvider>
  );
}
