import React from 'react';
import { View, Platform, StyleSheet, useWindowDimensions, TouchableOpacity } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import LessonsScreen from './screens/LessonsScreen';
import ClientsScreen from './screens/ClientsScreen';
import DashboardScreen from './screens/DashboardScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function SettingsButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Settings')}
      style={{ marginRight: 12 }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="settings-outline" size={22} color="#fff" />
    </TouchableOpacity>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons = {
            'שיעורים': 'calendar-outline',
            'לקוחות': 'people-outline',
            'דשבורד': 'stats-chart-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#999',
        headerStyle: { backgroundColor: '#6C63FF' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: { paddingBottom: 5, height: 60 },
        headerRight: () => <SettingsButton />,
      })}
    >
      <Tab.Screen name="שיעורים" component={LessonsScreen} />
      <Tab.Screen name="לקוחות" component={ClientsScreen} />
      <Tab.Screen name="דשבורד" component={DashboardScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 500;

  const content = (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'הגדרות',
            headerStyle: { backgroundColor: '#6C63FF' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  if (isDesktop) {
    return (
      <View style={styles.webOuter}>
        <View style={styles.webPhone}>{content}</View>
      </View>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    backgroundColor: '#D0CDE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webPhone: {
    width: 390,
    height: 844,
    overflow: 'hidden',
    borderRadius: 40,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
});
