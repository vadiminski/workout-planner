<script setup>
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router"; // Added useRoute
import { db } from "../db";

const router = useRouter();
const route = useRoute(); // To read URL params

const availableExercises = ref([]);
const selectedExerciseId = ref("");
const activeSession = ref([]);
const routineName = ref(""); // To show "Push Day" in header

onMounted(async () => {
  // 1. Load Library
  availableExercises.value = await db.exercises.toArray();

  // 2. Check if we are loading a Routine (e.g. /workout?routineId=1)
  if (route.query.routineId) {
    await loadRoutine(parseInt(route.query.routineId));
  }
});

const loadRoutine = async (id) => {
  // A. Get Routine Info
  const routine = await db.routines.get(id);
  if (routine) routineName.value = routine.name;

  // B. Get Exercises for this routine
  const links = await db.routineExercises
    .where("routineId")
    .equals(id)
    .toArray();

  // C. Build the session objects
  // We map over the links to find the actual exercise details
  activeSession.value = links.map((link) => {
    const ex = availableExercises.value.find((e) => e.id === link.exerciseId);
    return {
      exerciseId: ex.id,
      name: ex.name,
      sets: [
        // Pre-fill 3 empty sets by default for routines
        { weight: 0, reps: 0, rpe: 0, notes: "" },
        { weight: 0, reps: 0, rpe: 0, notes: "" },
        { weight: 0, reps: 0, rpe: 0, notes: "" },
      ],
    };
  });
};

const addExerciseToSession = () => {
  if (!selectedExerciseId.value) return;
  const ex = availableExercises.value.find(
    (e) => e.id === selectedExerciseId.value
  );

  activeSession.value.push({
    exerciseId: ex.id,
    name: ex.name,
    sets: [{ weight: 0, reps: 0, rpe: 0, notes: "" }],
  });
  selectedExerciseId.value = "";
};

const addSet = (exerciseIndex) => {
  const previousSet = activeSession.value[exerciseIndex].sets.at(-1);
  activeSession.value[exerciseIndex].sets.push({
    weight: previousSet ? previousSet.weight : 0,
    reps: previousSet ? previousSet.reps : 0,
    rpe: 0,
    notes: "",
  });
};

const removeSet = (exerciseIndex, setIndex) => {
  activeSession.value[exerciseIndex].sets.splice(setIndex, 1);
};

const finishWorkout = async () => {
  if (activeSession.value.length === 0) return router.push("/");

  const workoutId = await db.workoutLogs.add({
    startTime: new Date(),
    endTime: new Date(),
    routineId: route.query.routineId ? parseInt(route.query.routineId) : null,
  });

  const setsToSave = [];
  activeSession.value.forEach((exercise) => {
    exercise.sets.forEach((set, index) => {
      // Only save sets that have some data (optional cleanup)
      if (set.weight > 0 || set.reps > 0 || set.notes) {
        setsToSave.push({
          workoutLogId: workoutId,
          exerciseId: exercise.exerciseId,
          setNumber: index + 1,
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          notes: set.notes,
        });
      }
    });
  });

  if (setsToSave.length > 0) {
    await db.setLogs.bulkAdd(setsToSave);
  }

  router.push("/");
};
</script>

<template>
  <div class="p-4 min-h-screen pb-24">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold text-green-400">
          {{ routineName || "Active Session" }}
        </h1>
        <p v-if="routineName" class="text-xs text-slate-400">
          Following Routine
        </p>
      </div>
      <button @click="router.push('/')" class="text-slate-400">Cancel</button>
    </div>

    <div class="bg-slate-800 p-3 rounded-lg mb-6 flex gap-2">
      <select
        v-model="selectedExerciseId"
        class="bg-slate-700 text-white p-2 rounded flex-1"
      >
        <option value="" disabled>Add Extra Exercise...</option>
        <option v-for="ex in availableExercises" :key="ex.id" :value="ex.id">
          {{ ex.name }}
        </option>
      </select>
      <button
        @click="addExerciseToSession"
        class="bg-blue-600 px-4 rounded font-bold text-white"
      >
        +
      </button>
    </div>

    <div class="space-y-6">
      <div
        v-for="(exercise, exIndex) in activeSession"
        :key="exIndex"
        class="bg-slate-800 rounded-lg p-3 relative"
      >
        <button
          @click="activeSession.splice(exIndex, 1)"
          class="absolute top-3 right-3 text-slate-600 hover:text-red-400 font-bold"
        >
          ✕
        </button>

        <h3 class="font-bold text-lg mb-2 text-blue-300">
          {{ exercise.name }}
        </h3>

        <div
          class="grid grid-cols-10 gap-2 text-xs text-slate-400 mb-1 text-center"
        >
          <div class="col-span-1">#</div>
          <div class="col-span-3">Kg</div>
          <div class="col-span-2">Reps</div>
          <div class="col-span-2">RPE</div>
          <div class="col-span-2"></div>
        </div>

        <div
          v-for="(set, setIndex) in exercise.sets"
          :key="setIndex"
          class="grid grid-cols-10 gap-2 mb-2 items-center"
        >
          <div class="col-span-1 text-center font-bold text-slate-500">
            {{ setIndex + 1 }}
          </div>

          <input
            type="number"
            v-model="set.weight"
            class="col-span-3 bg-slate-900 text-white p-2 rounded text-center"
            placeholder="0"
          />
          <input
            type="number"
            v-model="set.reps"
            class="col-span-2 bg-slate-900 text-white p-2 rounded text-center"
            placeholder="0"
          />
          <input
            type="number"
            v-model="set.rpe"
            class="col-span-2 bg-slate-900 text-white p-2 rounded text-center text-yellow-400"
            placeholder="-"
          />

          <button
            @click="removeSet(exIndex, setIndex)"
            class="col-span-2 text-red-400 text-xs bg-red-900/30 py-2 rounded"
          >
            X
          </button>

          <div class="col-span-10 mt-1">
            <input
              v-model="set.notes"
              type="text"
              placeholder="Notes..."
              class="w-full bg-transparent border-b border-slate-700 text-xs text-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <button
          @click="addSet(exIndex)"
          class="w-full py-2 mt-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded"
        >
          + Add Set
        </button>
      </div>
    </div>

    <div
      class="fixed bottom-0 left-0 w-full p-4 bg-slate-900 border-t border-slate-800"
    >
      <button
        @click="finishWorkout"
        class="w-full bg-green-600 py-3 rounded-lg font-bold text-white text-lg shadow-lg"
      >
        Finish Workout
      </button>
    </div>
  </div>
</template>
