import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import WorkoutView from "./views/WorkoutView.vue";
import SettingsView from "./views/SettingsView.vue";
import RoutineEditor from "./views/RoutineEditor.vue";

const routes = [
  { path: "/", component: HomeView },
  { path: "/workout", component: WorkoutView },
  { path: "/settings", component: SettingsView },
  { path: "/routine-editor/:id?", component: RoutineEditor },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
