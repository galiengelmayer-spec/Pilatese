import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Shared full-page slide-in layout used by both LessonDetailScreen and
 * ClientDetailScreen. Provides the purple header with centred title + ✕ close
 * button, and a scrollable body that matches the app's #F0EEF8 background.
 *
 * The slide animation is supplied by the Stack.Navigator (animation:
 * 'slide_from_right') — this component handles only layout and the close action.
 */
export default function SlidePanel({ title, children, scrollable = true }) {
  const navigation = useNavigation();

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        {/* Left spacer keeps title centred */}
        <View style={styles.headerSide} />
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerSide}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Body */}
      {scrollable ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, { flex: 1 }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0EEF8' },
  header: {
    backgroundColor: '#6C63FF',
    paddingTop: 14, paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  headerSide: { width: 34, alignItems: 'flex-end' },
  headerTitle: {
    flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 17, textAlign: 'center',
  },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 48 },
});
