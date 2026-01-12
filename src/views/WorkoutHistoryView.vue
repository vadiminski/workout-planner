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

  // Efficiently fetch exercise names
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

  // Sort sets by setNumber
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
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-100 p-4 pb-20">
    <div class="flex items-center mb-6 border-b border-slate-800 pb-4">
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
