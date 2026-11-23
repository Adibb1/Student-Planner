/* Service worker for push notifications.
 * It receives reminders while the planner is closed and shows them.
 * The Firebase settings are passed in the address (?apiKey=...) by lib/firebase/messaging.ts,
 * so you never need to edit this file. */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;

firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

// Notifications that include a "notification" payload are shown automatically,
// and tapping them opens the link set by the server (fcmOptions.link).
firebase.messaging();
