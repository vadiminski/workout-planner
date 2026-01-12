<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { db } from "../db";

const route = useRoute();
const router = useRouter();

const workout = ref(null);
const sessionData = ref([]);
const loading = ref(true);

onMounted(async () => {
  const workoutId = parseInt(route.params.id);

  // 1. Fetch Workout Log
  workout.value = await db.workoutLogs.get(workoutId);

  if (!workout.value) {
    router.push("/");
    return;
  }

  // 2. Fetch Sets
  const sets = await db.setLogs
    .where("workoutLogId")
    .equals(workoutId)
    .toArray();

  // 3. Group by Exercise
  const grouped = {};

  const uniqueExIds = [...new Set(sets.map((s) => s.exerciseId))];
  const exercises = await db.exercises.where("id").anyOf(uniqueExIds).toArray();
  const exerciseMap = {};
  exercises.forEach((e) => (exerciseMap[e.id] = e.name));

  sets.forEach((set) => {
    if (!grouped[set.exerciseId]) {
      grouped[set.exerciseId] = {
        name: exerciseMap[set.exerciseId] || "Unknown Exercise",
        sets: [],
      };
    }
    grouped[set.exerciseId].sets.push(set);
  });

  Object.values(grouped).forEach((ex) => {
    ex.sets.sort((a, b) => a.setNumber - b.setNumber);
  });

  sessionData.value = Object.values(grouped);
  loading.value = false;
});

const formatDate = (date) => {
  return new Date(date).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// --- DELETE FUNCTION ---
const deleteWorkout = async () => {
  if (
    !confirm(
      "Are you sure you want to delete this workout history?\n\nThis cannot be undone."
    )
  ) {
    return;
  }

  const workoutId = parseInt(route.params.id);

  try {
    // Perform a transaction to ensure clean removal
    await db.transaction("rw", db.workoutLogs, db.setLogs, async () => {
      // 1. Delete the main log entry
      await db.workoutLogs.delete(workoutId);

      // 2. Delete all sets associated with this specific workout ID
      await db.setLogs.where("workoutLogId").equals(workoutId).delete();
    });

    // Go back to dashboard
    router.push("/");
  } catch (error) {
    console.error("Failed to delete workout:", error);
    alert("Error deleting workout.");
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-100 p-4 pb-20">
    <div
      class="flex justify-between items-center mb-6 border-b border-slate-800 pb-4"
    >
      <div class="flex items-center">
        <button @click="router.back()" class="text-blue-400 mr-4 font-bold">
          ← Back
        </button>
        <div>
          <h1 class="font-bold text-lg">Workout Details</h1>
          <p v-if="workout" class="text-xs text-slate-400">
            {{ formatDate(workout.startTime) }}
          </p>
        </div>
      </div>

      <button
        @click="deleteWorkout"
        class="text-red-500 hover:text-red-400 hover:bg-red-900/20 p-2 rounded transition-colors"
        title="Delete Workout"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-6 h-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
      </button>
    </div>

    <div v-if="loading" class="text-center py-8 text-slate-500">Loading...</div>

    <div v-else class="space-y-4">
      <div
        v-for="ex in sessionData"
        :key="ex.name"
        class="bg-slate-800 p-4 rounded-lg border border-slate-700"
      >
        <h3 class="font-bold text-blue-300 mb-3">{{ ex.name }}</h3>

        <div class="space-y-2">
          <div
            v-for="(set, i) in ex.sets"
            :key="i"
            class="border-b border-slate-700/50 last:border-0 pb-1"
          >
            <div class="flex justify-between text-sm">
              <span class="text-slate-500 w-8">#{{ set.setNumber }}</span>
              <span class="font-mono text-white flex-1 text-right">
                {{ set.weight }}kg x {{ set.reps }}
              </span>
            </div>
            <div
              v-if="set.notes"
              class="text-xs text-slate-400 italic mt-1 text-right"
            >
              📝 {{ set.notes }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
