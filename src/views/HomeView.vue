<script setup>
import { ref, onMounted } from "vue";
import { db } from "../db";
import { useRouter } from "vue-router";

const router = useRouter();

// State
const history = ref([]);
const routines = ref([]);
const loading = ref(true);

onMounted(async () => {
  await loadData();
});

const loadData = async () => {
  loading.value = true;
  await Promise.all([loadHistory(), loadRoutines()]);
  loading.value = false;
};

// 1. Fetch Routines (Templates)
const loadRoutines = async () => {
  routines.value = await db.routines.toArray();
};

// 2. Fetch History (Logs)
const loadHistory = async () => {
  // Get all workout logs, sorted by newest first
  const logs = await db.workoutLogs
    .orderBy("startTime")
    .reverse()
    .limit(10) // Limit to last 10 for performance
    .toArray();

  // Enrich logs with details
  history.value = await Promise.all(
    logs.map(async (workout) => {
      // Get sets to calculate stats
      const sets = await db.setLogs
        .where("workoutLogId")
        .equals(workout.id)
        .toArray();

      // Get unique exercise names for summary
      const uniqueExerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
      const exercises = await db.exercises
        .where("id")
        .anyOf(uniqueExerciseIds)
        .toArray();
      const exerciseNames = exercises.map((e) => e.name).join(", ");

      return {
        ...workout,
        displayDate: workout.startTime.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        exerciseSummary: exerciseNames || "No exercises logged",
        totalSets: sets.length,
      };
    })
  );
};

// Helper to format duration
const getDuration = (start, end) => {
  if (!end) return "Ongoing";
  const diffMs = end - start;
  const minutes = Math.floor(diffMs / 60000);
  return `${minutes} min`;
};

// Start a specific routine
const startRoutine = (routineId) => {
  router.push({ path: "/workout", query: { routineId } });
};
</script>

<template>
  <div class="p-4 max-w-lg mx-auto pb-24 text-slate-100">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">My Dashboard</h1>
      <router-link
        to="/settings"
        class="text-2xl p-2 rounded hover:bg-slate-800"
      >
        ⚙️
      </router-link>
    </div>

    <section class="mb-8">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-slate-200">My Routines</h2>
        <router-link
          to="/routine-editor"
          class="text-blue-400 text-sm font-bold"
        >
          + New
        </router-link>
      </div>

      <div v-if="routines.length > 0" class="flex gap-4 overflow-x-auto pb-2">
        <div
          v-for="routine in routines"
          :key="routine.id"
          @click="startRoutine(routine.id)"
          class="min-w-[140px] bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm cursor-pointer hover:border-blue-500 transition-colors relative group"
        >
          <button
            @click.stop="router.push(`/routine-editor/${routine.id}`)"
            class="absolute top-2 right-2 p-1.5 rounded-full bg-slate-700 text-slate-300 hover:bg-blue-600 hover:text-white transition-colors z-10"
            title="Edit Routine"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="w-4 h-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
          </button>

          <div class="font-bold text-lg mb-1 pr-6">{{ routine.name }}</div>
          <div class="text-xs text-slate-400">Tap to start</div>
        </div>
      </div>

      <div
        v-else
        class="bg-slate-800/50 p-6 rounded-lg text-center border border-slate-700 border-dashed"
      >
        <p class="text-slate-400 mb-2">No routines yet.</p>
        <router-link
          to="/routine-editor"
          class="text-blue-400 font-bold text-sm"
        >
          Create your first routine
        </router-link>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-200">Recent History</h2>

      <div v-if="loading" class="text-center text-slate-500 py-4">
        Loading...
      </div>

      <div
        v-else-if="history.length === 0"
        class="text-center text-slate-500 py-8"
      >
        No history yet.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="item in history"
          :key="item.id"
          class="bg-slate-800 p-4 rounded-xl border border-slate-700"
        >
          <div class="flex justify-between items-start mb-1">
            <span class="font-bold text-white">{{ item.displayDate }}</span>
            <span class="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded">
              {{ getDuration(item.startTime, item.endTime) }}
            </span>
          </div>
          <div class="text-sm text-blue-300 truncate mb-1">
            {{ item.exerciseSummary }}
          </div>
          <div class="text-xs text-slate-500">
            {{ item.totalSets }} Sets performed
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
