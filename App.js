import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import LessonsScreen from './screens/LessonsScreen';
import ClientsScreen from './screens/ClientsScreen';
import DashboardScreen from './screens/DashboardScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const nav = (
    <NavigationContainer>
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
        })}
      >
        <Tab.Screen name="שיעורים" component={LessonsScreen} />
        <Tab.Screen name="לקוחות" component={ClientsScreen} />
        <Tab.Screen name="דשבורד" component={DashboardScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webOuter}>
        <View style={styles.webPhone}>{nav}</View>
      </View>
    );
  }
  return nav;
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
