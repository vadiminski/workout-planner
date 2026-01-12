import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import WorkoutView from "./views/WorkoutView.vue";
import SettingsView from "./views/SettingsView.vue";
import RoutineEditor from "./views/RoutineEditor.vue";
import WorkoutHistoryView from "./views/WorkoutHistoryView.vue"; // 1. Import

const routes = [
  { path: "/", component: HomeView },
  { path: "/workout", component: WorkoutView },
  { path: "/settings", component: SettingsView },
  { path: "/routine-editor/:id?", component: RoutineEditor },
  { path: "/history/:id", component: WorkoutHistoryView }, // 2. Add Route
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
