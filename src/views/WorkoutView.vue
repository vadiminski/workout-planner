<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { db } from "../db";

const router = useRouter();
const route = useRoute();

// --- STATE ---
const availableExercises = ref([]);
const activeSession = ref([]); // The full data structure
const routineName = ref("");

// Focus Mode State
const currentExIndex = ref(0);
const currentSetIndex = ref(0);
const viewState = ref("loading"); // 'loading', 'active', 'resting', 'summary'

// Timer State
const timerSeconds = ref(90); // Default rest time
const remainingTime = ref(90);
let timerInterval = null;

// --- COMPUTED HELPERS ---
const currentExercise = computed(
  () => activeSession.value[currentExIndex.value]
);
const currentSet = computed(() => {
  if (!currentExercise.value) return null;
  return currentExercise.value.sets[currentSetIndex.value];
});

const isLastSetOfExercise = computed(() => {
  if (!currentExercise.value) return false;
  return currentSetIndex.value === currentExercise.value.sets.length - 1;
});

const isLastSetOfWorkout = computed(() => {
  return (
    currentExIndex.value === activeSession.value.length - 1 &&
    isLastSetOfExercise.value
  );
});

// --- LIFECYCLE ---
onMounted(async () => {
  availableExercises.value = await db.exercises.toArray();

  if (route.query.routineId) {
    await loadRoutineWithHistory(parseInt(route.query.routineId));
  } else {
    router.push("/");
  }
});

onUnmounted(() => {
  stopTimer();
});

// --- DATA LOADING ---
const loadRoutineWithHistory = async (routineId) => {
  const routine = await db.routines.get(routineId);
  if (routine) routineName.value = routine.name;

  const templateLinks = await db.routineExercises
    .where("routineId")
    .equals(routineId)
    .toArray();

  const lastLog = await db.workoutLogs
    .where("routineId")
    .equals(routineId)
    .reverse()
    .first();

  let historySets = [];
  if (lastLog) {
    historySets = await db.setLogs
      .where("workoutLogId")
      .equals(lastLog.id)
      .toArray();
  }

  activeSession.value = templateLinks.map((link) => {
    const ex = availableExercises.value.find((e) => e.id === link.exerciseId);
    const prevSets = historySets
      .filter((s) => s.exerciseId === ex.id)
      .sort((a, b) => a.setNumber - b.setNumber);

    const setsCount = prevSets.length > 0 ? prevSets.length : 3;

    const currentSets = Array.from({ length: setsCount }).map((_, i) => {
      const prev = prevSets[i] || {};
      return {
        prevWeight: prev.weight || "-",
        prevReps: prev.reps || "-",
        prevRpe: prev.rpe || "-",
        weight: null,
        reps: null,
        rpe: null,
        notes: "",
      };
    });

    return { exerciseId: ex.id, name: ex.name, sets: currentSets };
  });

  viewState.value = "active"; // Start the workout
};

// --- ACTIONS ---

const finishSet = () => {
  // Logic Fix: Check if this is the last set of the entire workout
  if (isLastSetOfWorkout.value) {
    // Skip timer, go straight to summary
    viewState.value = "summary";
  } else {
    // Otherwise, start the rest timer
    viewState.value = "resting";
    startTimer();
  }
};

const nextStep = () => {
  stopTimer();

  // Advance indices
  if (isLastSetOfExercise.value) {
    currentExIndex.value++;
    currentSetIndex.value = 0;
  } else {
    currentSetIndex.value++;
  }

  // Back to work
  viewState.value = "active";
};

// --- TIMER LOGIC ---
const startTimer = () => {
  remainingTime.value = timerSeconds.value;
  timerInterval = setInterval(() => {
    remainingTime.value--;
    if (remainingTime.value <= 0) {
      nextStep(); // Auto-advance when timer hits 0
    }
  }, 1000);
};

const stopTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
};

const adjustTimer = (seconds) => {
  remainingTime.value += seconds;
};

// --- FINAL SAVE ---
const saveAndExit = async () => {
  const workoutId = await db.workoutLogs.add({
    startTime: new Date(),
    endTime: new Date(),
    routineId: route.query.routineId ? parseInt(route.query.routineId) : null,
  });

  const setsToSave = [];
  activeSession.value.forEach((exercise) => {
    exercise.sets.forEach((set, index) => {
      // 1. RESOLVE VALUES: Use Input -> Fallback to Previous -> Fallback to 0
      const finalWeight =
        set.weight !== null && set.weight !== ""
          ? set.weight
          : set.prevWeight !== "-"
          ? set.prevWeight
          : 0;

      const finalReps =
        set.reps !== null && set.reps !== ""
          ? set.reps
          : set.prevReps !== "-"
          ? set.prevReps
          : 0;

      const finalRpe =
        set.rpe !== null && set.rpe !== ""
          ? set.rpe
          : set.prevRpe !== "-"
          ? set.prevRpe
          : 0;

      // 2. CHECK: Only save if we actually have data (or notes)
      // This ensures we don't save completely empty "ghost" sets if you added extras and didn't do them
      const hasData = finalWeight > 0 || finalReps > 0 || set.notes;

      if (hasData) {
        setsToSave.push({
          workoutLogId: workoutId,
          exerciseId: exercise.exerciseId,
          setNumber: index + 1,
          weight: finalWeight,
          reps: finalReps,
          rpe: finalRpe,
          notes: set.notes || "",
        });
      }
    });
  });

  if (setsToSave.length > 0) await db.setLogs.bulkAdd(setsToSave);
  router.push("/");
};
</script>

<template>
  <div class="h-screen bg-slate-900 text-slate-100 flex flex-col">
    <div
      class="p-4 flex justify-between items-center border-b border-slate-800"
    >
      <h1 class="font-bold text-green-400">{{ routineName }}</h1>
      <button @click="router.push('/')" class="text-sm text-slate-400">
        Cancel
      </button>
    </div>

    <div
      v-if="viewState === 'loading'"
      class="flex-1 flex items-center justify-center"
    >
      Loading...
    </div>

    <div v-else-if="viewState === 'active'" class="flex-1 flex flex-col p-6">
      <div
        class="text-center text-slate-500 text-xs mb-6 font-mono tracking-widest uppercase"
      >
        Ex {{ currentExIndex + 1 }}/{{ activeSession.length }} • Set
        {{ currentSetIndex + 1 }}/{{ currentExercise.sets.length }}
      </div>

      <h2 class="text-3xl font-bold text-center text-blue-300 mb-8">
        {{ currentExercise.name }}
      </h2>

      <div
        class="bg-slate-800/50 p-4 rounded-lg text-center mb-8 border border-slate-700"
      >
        <div class="text-xs text-slate-400 uppercase mb-1">Last Time</div>
        <div class="text-xl font-mono text-slate-200">
          {{ currentSet.prevWeight }}<span class="text-sm">kg</span>
          <span class="mx-2 text-slate-600">x</span>
          {{ currentSet.prevReps }}<span class="text-sm">reps</span>
        </div>
      </div>

      <div class="space-y-6">
        <div class="grid grid-cols-2 gap-6">
          <div>
            <label class="block text-sm text-slate-400 mb-2 text-center"
              >Weight (kg)</label
            >
            <input
              type="number"
              v-model="currentSet.weight"
              :placeholder="
                currentSet.prevWeight !== '-' ? currentSet.prevWeight : '0'
              "
              class="w-full bg-slate-800 text-white text-3xl p-4 rounded-xl text-center focus:ring-2 focus:ring-blue-500 outline-none"
              autofocus
            />
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-2 text-center"
              >Reps</label
            >
            <input
              type="number"
              v-model="currentSet.reps"
              :placeholder="
                currentSet.prevReps !== '-' ? currentSet.prevReps : '0'
              "
              class="w-full bg-slate-800 text-white text-3xl p-4 rounded-xl text-center focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-1">
            <label class="block text-xs text-slate-400 mb-1 text-center"
              >RPE</label
            >
            <input
              type="number"
              v-model="currentSet.rpe"
              class="w-full bg-slate-800 text-yellow-400 text-xl p-3 rounded-lg text-center outline-none"
              placeholder="-"
            />
          </div>
          <div class="col-span-2">
            <label class="block text-xs text-slate-400 mb-1">Notes</label>
            <input
              type="text"
              v-model="currentSet.notes"
              class="w-full bg-slate-800 text-slate-300 text-sm p-3.5 rounded-lg outline-none"
              placeholder="How did it feel?"
            />
          </div>
        </div>
      </div>

      <div class="mt-auto pt-6">
        <button
          @click="finishSet"
          class="w-full py-5 rounded-2xl font-bold text-white text-xl shadow-lg transition-transform active:scale-95"
          :class="isLastSetOfWorkout ? 'bg-green-600' : 'bg-blue-600'"
        >
          {{ isLastSetOfWorkout ? "Finish Workout" : "Done & Rest" }}
        </button>
      </div>
    </div>

    <div
      v-else-if="viewState === 'resting'"
      class="flex-1 bg-black/90 absolute inset-0 z-50 flex flex-col items-center justify-center"
    >
      <div class="text-slate-400 text-sm uppercase tracking-widest mb-4">
        Resting
      </div>

      <div class="text-8xl font-mono font-bold text-white mb-8 tabular-nums">
        {{ Math.floor(remainingTime / 60) }}:{{
          (remainingTime % 60).toString().padStart(2, "0")
        }}
      </div>

      <div class="flex gap-4 mb-12">
        <button
          @click="adjustTimer(-10)"
          class="px-4 py-2 bg-slate-800 rounded-full text-slate-300"
        >
          -10s
        </button>
        <button
          @click="adjustTimer(30)"
          class="px-4 py-2 bg-slate-800 rounded-full text-slate-300"
        >
          +30s
        </button>
      </div>

      <button
        @click="nextStep"
        class="bg-green-600 px-12 py-4 rounded-full font-bold text-white text-lg shadow-lg hover:bg-green-500 transition-colors"
      >
        Start Next Set
      </button>

      <div class="mt-12 text-center opacity-50">
        <div class="text-xs uppercase">Up Next</div>
        <div class="font-bold text-blue-300">
          {{
            isLastSetOfExercise ? "Next Exercise" : `Set ${currentSetIndex + 2}`
          }}
        </div>
      </div>
    </div>

    <div
      v-else-if="viewState === 'summary'"
      class="flex-1 flex flex-col p-4 overflow-y-auto"
    >
      <h2 class="text-2xl font-bold text-white mb-4">Workout Summary</h2>
      <p class="text-slate-400 mb-6">
        Great job! Review your numbers before saving.
      </p>

      <div class="space-y-4 mb-20">
        <div
          v-for="ex in activeSession"
          :key="ex.exerciseId"
          class="bg-slate-800 p-4 rounded-lg"
        >
          <h3 class="font-bold text-blue-300 mb-2">{{ ex.name }}</h3>
          <div
            v-for="(s, i) in ex.sets"
            :key="i"
            class="flex justify-between text-sm py-1 border-b border-slate-700/50 last:border-0"
          >
            <span class="text-slate-400">Set {{ i + 1 }}</span>
            <span class="text-white font-mono">
              {{
                s.weight !== null
                  ? s.weight
                  : s.prevWeight !== "-"
                  ? s.prevWeight
                  : 0
              }}kg x
              {{
                s.reps !== null ? s.reps : s.prevReps !== "-" ? s.prevReps : 0
              }}
            </span>
          </div>
        </div>
      </div>

      <button
        @click="saveAndExit"
        class="fixed bottom-4 left-4 right-4 bg-green-600 py-4 rounded-xl font-bold text-white text-lg shadow-lg"
      >
        Save & Finish
      </button>
    </div>
  </div>
</template>
