// The app's entry: the background task for notification buttons is defined first (it must be
// defined in the global scope before anything else runs, lib/pushTask.ts), then expo-router.
import './lib/pushTask.js';
import 'expo-router/entry';
