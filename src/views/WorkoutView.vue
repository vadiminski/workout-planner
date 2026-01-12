<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { db } from "../db";

const router = useRouter();
const route = useRoute();

// --- STATE ---
const availableExercises = ref([]);
const activeSession = ref([]);
const routineName = ref("");
const editingExerciseId = ref(null);

// Focus Mode
const currentExIndex = ref(0);
const currentSetIndex = ref(0);
const viewState = ref("loading");

// Timers
const restTimerSeconds = ref(90);
const restRemaining = ref(90);
let restInterval = null;

// ACTIVE Timer (For time-based exercises)
const activeTimerSeconds = ref(0);
let activeInterval = null;
const isActiveTimerRunning = ref(false);

// PREP Timer (10s countdown before first time-based exercise)
const prepTimerSeconds = ref(10);
const isPrepTimerRunning = ref(false);
let prepInterval = null;

// --- HELPER: Parse mm:ss to seconds ---
const parseTimeToSeconds = (timeStr) => {
  if (!timeStr) return 60;
  if (typeof timeStr === "number") return timeStr;
  if (!timeStr.includes(":")) return parseInt(timeStr) || 60;
  const [m, s] = timeStr.split(":").map(Number);
  return m * 60 + s;
};

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

// "UP NEXT" Logic for Rest Screen
const nextStepInfo = computed(() => {
  if (!isLastSetOfExercise.value) {
    return {
      type: "Set",
      text: `Set ${currentSetIndex.value + 2} of ${
        currentExercise.value.sets.length
      }`,
      subtext: currentExercise.value.name,
    };
  }

  if (currentExIndex.value < activeSession.value.length - 1) {
    const nextEx = activeSession.value[currentExIndex.value + 1];
    return {
      type: "Exercise",
      text: nextEx.name,
      subtext: "Set 1",
    };
  }

  return null;
});

// VALIDATION LOGIC
const isCurrentSetValid = computed(() => {
  if (!currentSet.value) return false;
  const s = currentSet.value;
  const isWeightValid = s.weight !== null && s.weight !== "";
  let isValValid = false;

  if (s.type === "time") {
    isValValid = /^\d{1,2}:\d{2}$/.test(s.val);
  } else {
    isValValid = s.val !== null && s.val !== "" && s.val > 0;
  }
  return isWeightValid && isValValid;
});

// Formatted Active Timer
const formattedActiveTimer = computed(() => {
  const m = Math.floor(activeTimerSeconds.value / 60)
    .toString()
    .padStart(2, "0");
  const s = (activeTimerSeconds.value % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
  stopRestTimer();
  stopActiveTimer();
  stopPrepTimer();
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

    const targetSetsCount = link.targetSets || 3;

    const currentSets = Array.from({ length: targetSetsCount }).map((_, i) => {
      const history = prevSets[i];
      const pWeight = history ? history.weight : link.targetWeight;
      const pVal = history ? history.reps : link.targetVal;

      let initialWeight = null;
      let initialVal = null;

      if (link.type === "time") {
        if (pWeight !== undefined) initialWeight = pWeight;
        else if (link.targetWeight !== undefined)
          initialWeight = link.targetWeight;
        else initialWeight = 0;

        if (pVal !== undefined && pVal !== "-") initialVal = pVal;
        else if (link.targetVal) initialVal = link.targetVal;
        else initialVal = "01:00";
      }

      return {
        lastWeight: pWeight !== undefined ? pWeight : "-",
        lastVal: pVal !== undefined ? pVal : "-",
        targetWeight: link.targetWeight,
        targetVal: link.targetVal,
        weight: initialWeight,
        val: initialVal,
        rpe: null,
        notes: "",
        type: link.type || "reps",
      };
    });

    return {
      exerciseId: ex.id,
      name: ex.name,
      sets: currentSets,
      type: link.type || "reps",
      restTimeStr: link.targetRest || "01:30",
    };
  });

  viewState.value = "active";

  // Trigger prep logic for first exercise
  initActiveSet(true);
};

// --- INPUT HANDLERS ---
const validateRpe = () => {
  if (currentSet.value.rpe > 10) currentSet.value.rpe = 10;
  if (currentSet.value.rpe < 0) currentSet.value.rpe = 0;
};

const validateTimeInput = (event) => {
  let val = event.target.value;
  val = val.replace(/[^0-9:]/g, "");
  if (val.length > 5) val = val.slice(0, 5);
  currentSet.value.val = val;
};

// --- PREP TIMER LOGIC ---
const startPrepTimer = () => {
  isPrepTimerRunning.value = true;
  prepTimerSeconds.value = 10;

  prepInterval = setInterval(() => {
    prepTimerSeconds.value--;
    if (prepTimerSeconds.value <= 0) {
      stopPrepTimer();
      startActiveTimer();
    }
  }, 1000);
};

const stopPrepTimer = () => {
  if (prepInterval) clearInterval(prepInterval);
  isPrepTimerRunning.value = false;
};

const skipPrep = () => {
  stopPrepTimer();
  startActiveTimer();
};

// --- ACTIVE TIMER LOGIC ---
const startActiveTimer = () => {
  if (isActiveTimerRunning.value) return;
  isActiveTimerRunning.value = true;

  activeInterval = setInterval(() => {
    if (activeTimerSeconds.value > 0) {
      activeTimerSeconds.value--;
    } else {
      finishSet();
    }
  }, 1000);
};

const stopActiveTimer = () => {
  if (activeInterval) clearInterval(activeInterval);
  isActiveTimerRunning.value = false;

  if (currentSet.value && !currentSet.value.val) {
    currentSet.value.val = currentSet.value.targetVal || "01:00";
  }
};

const toggleActiveTimer = () => {
  if (isActiveTimerRunning.value) stopActiveTimer();
  else startActiveTimer();
};

const resetActiveTimer = () => {
  if (activeInterval) clearInterval(activeInterval);
  isActiveTimerRunning.value = false;

  if (currentSet.value && currentSet.value.type === "time") {
    const target = currentSet.value.targetVal || "01:00";
    activeTimerSeconds.value = parseTimeToSeconds(target);
  } else {
    activeTimerSeconds.value = 0;
  }
};

const initActiveSet = (isFirstLoad = false) => {
  resetActiveTimer();

  if (currentSet.value && currentSet.value.type === "time") {
    if (
      isFirstLoad &&
      currentExIndex.value === 0 &&
      currentSetIndex.value === 0
    ) {
      startPrepTimer();
    } else {
      startActiveTimer();
    }
  }
};

// --- NAVIGATION ---
const finishSet = () => {
  if (activeInterval) clearInterval(activeInterval);
  isActiveTimerRunning.value = false;

  if (currentSet.value && !currentSet.value.val) {
    currentSet.value.val = currentSet.value.targetVal || "01:00";
  }

  activeTimerSeconds.value = 0;

  if (isLastSetOfWorkout.value) {
    viewState.value = "summary";
  } else {
    const restStr = currentExercise.value.restTimeStr;
    const seconds = parseTimeToSeconds(restStr);
    restTimerSeconds.value = seconds;
    startRestTimer();
    viewState.value = "resting";
  }
};

const nextStep = () => {
  stopRestTimer();
  if (isLastSetOfExercise.value) {
    currentExIndex.value++;
    currentSetIndex.value = 0;
  } else {
    currentSetIndex.value++;
  }

  viewState.value = "active";
  initActiveSet();
};

// --- REST TIMER ---
const startRestTimer = () => {
  restRemaining.value = restTimerSeconds.value;
  restInterval = setInterval(() => {
    restRemaining.value--;
    if (restRemaining.value <= 0) {
      nextStep();
    }
  }, 1000);
};

const stopRestTimer = () => {
  if (restInterval) clearInterval(restInterval);
};

const adjustRestTimer = (s) => (restRemaining.value += s);

// --- SAVE ---
const saveAndExit = async () => {
  const workoutId = await db.workoutLogs.add({
    startTime: new Date(),
    endTime: new Date(),
    routineId: route.query.routineId ? parseInt(route.query.routineId) : null,
  });

  const setsToSave = [];

  activeSession.value.forEach((exercise) => {
    exercise.sets.forEach((set, index) => {
      const finalWeight =
        set.weight !== null && set.weight !== "" ? parseFloat(set.weight) : 0;
      let finalVal =
        set.val !== null && set.val !== ""
          ? set.val
          : set.type === "time"
          ? "00:00"
          : 0;
      const finalRpe =
        set.rpe !== null && set.rpe !== "" ? parseFloat(set.rpe) : 0;

      if (set.type === "reps") finalVal = parseInt(finalVal) || 0;
      const hasData =
        finalWeight > 0 ||
        (set.type === "reps" ? finalVal > 0 : finalVal !== "00:00");

      if (hasData) {
        setsToSave.push({
          workoutLogId: workoutId,
          exerciseId: exercise.exerciseId,
          setNumber: index + 1,
          weight: finalWeight,
          reps: finalVal,
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
  <div class="h-screen bg-slate-900 text-slate-100 flex flex-col relative">
    <div
      v-if="isPrepTimerRunning"
      class="absolute inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-6"
    >
      <div class="text-slate-400 uppercase tracking-widest mb-4 animate-pulse">
        Get Ready
      </div>
      <div class="text-[12rem] font-bold text-yellow-400 leading-none mb-8">
        {{ prepTimerSeconds }}
      </div>

      <div v-if="currentExercise" class="mb-12 text-center">
        <div class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
          Up Next
        </div>
        <div class="font-bold text-blue-300 text-2xl">
          {{ currentExercise.name }}
        </div>
        <div class="text-sm text-slate-400">Set 1</div>
      </div>

      <button
        @click="skipPrep"
        class="px-8 py-4 bg-slate-800 rounded-full text-white font-bold text-lg hover:bg-slate-700"
      >
        Skip / Start Now
      </button>
    </div>

    <div
      class="p-4 flex justify-between items-center border-b border-slate-800"
    >
      <h1 class="font-bold text-green-400">{{ routineName }}</h1>
      <button @click="router.push('/')" class="text-sm text-slate-400">
        Cancel
      </button>
    </div>

    <div v-if="viewState === 'active'" class="flex-1 flex flex-col p-6">
      <div
        class="text-center text-slate-500 text-xs mb-4 font-mono uppercase tracking-widest"
      >
        Set {{ currentSetIndex + 1 }} of {{ currentExercise.sets.length }}
      </div>

      <h2 class="text-3xl font-bold text-center text-blue-300 mb-2">
        {{ currentExercise.name }}
      </h2>
      <div class="text-center mb-6">
        <span
          class="bg-slate-800 text-xs px-2 py-1 rounded text-slate-400 uppercase font-bold border border-slate-700"
        >
          {{ currentSet.type === "time" ? "Duration" : "Reps" }} Based
        </span>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6">
        <div
          class="bg-slate-800/50 p-3 rounded-lg text-center border border-slate-700"
        >
          <div class="text-xs text-slate-400 uppercase mb-1">Target</div>
          <div class="text-lg font-mono text-slate-200">
            {{ currentSet.targetWeight
            }}<span class="text-xs text-slate-500">kg</span>
            <span class="mx-1 text-slate-600">|</span>
            {{ currentSet.targetVal }}
          </div>
        </div>
        <div
          class="bg-slate-800/50 p-3 rounded-lg text-center border border-slate-700"
        >
          <div class="text-xs text-slate-400 uppercase mb-1">Last</div>
          <div class="text-lg font-mono text-slate-200">
            {{ currentSet.lastWeight
            }}<span class="text-xs text-slate-500">kg</span>
            <span class="mx-1 text-slate-600">|</span>
            {{ currentSet.lastVal }}
          </div>
        </div>
      </div>

      <div
        v-if="currentSet.type === 'time'"
        class="mb-6 bg-slate-800 rounded-xl p-4 border border-slate-700 text-center"
      >
        <div
          class="text-5xl font-mono font-bold mb-4"
          :class="isActiveTimerRunning ? 'text-green-400' : 'text-slate-500'"
        >
          {{ formattedActiveTimer }}
        </div>
        <div class="flex justify-center gap-4">
          <button
            @click="toggleActiveTimer"
            class="px-6 py-2 rounded font-bold text-slate-900"
            :class="isActiveTimerRunning ? 'bg-yellow-500' : 'bg-green-500'"
          >
            {{ isActiveTimerRunning ? "Pause" : "Start Timer" }}
          </button>
          <button
            @click="resetActiveTimer"
            class="px-4 py-2 rounded bg-slate-700 text-slate-300"
          >
            Reset
          </button>
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
              placeholder="0"
              class="w-full bg-slate-800 text-white text-3xl p-4 rounded-xl text-center outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
            />
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-2 text-center">
              {{ currentSet.type === "time" ? "Time (mm:ss)" : "Reps" }}
            </label>
            <input
              v-if="currentSet.type === 'time'"
              type="text"
              inputmode="numeric"
              v-model="currentSet.val"
              @input="validateTimeInput"
              placeholder="00:00"
              class="w-full bg-slate-800 text-white text-3xl p-4 rounded-xl text-center outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
            />
            <input
              v-else
              type="number"
              min="0"
              v-model="currentSet.val"
              placeholder="0"
              class="w-full bg-slate-800 text-white text-3xl p-4 rounded-xl text-center outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-1">
            <label class="block text-xs text-slate-400 mb-1 text-center"
              >RPE (0-10)</label
            >
            <input
              type="number"
              v-model="currentSet.rpe"
              @input="validateRpe"
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
              placeholder="Notes..."
            />
          </div>
        </div>
      </div>

      <div class="mt-auto pt-6">
        <button
          @click="finishSet"
          :disabled="!isCurrentSetValid"
          class="w-full py-5 rounded-2xl font-bold text-xl shadow-lg active:scale-95 transition-all"
          :class="
            !isCurrentSetValid
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : isLastSetOfWorkout
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white'
          "
        >
          {{ isLastSetOfWorkout ? "Finish Workout" : "Done & Rest" }}
        </button>
      </div>
    </div>

    <div
      v-else-if="viewState === 'resting'"
      class="flex-1 bg-black/90 absolute inset-0 z-50 flex flex-col items-center justify-center p-6"
    >
      <div class="text-slate-400 uppercase tracking-widest mb-4">Resting</div>
      <div class="text-8xl font-mono font-bold text-white mb-8 tabular-nums">
        {{ Math.floor(restRemaining / 60) }}:{{
          (restRemaining % 60).toString().padStart(2, "0")
        }}
      </div>
      <div class="flex gap-4 mb-8">
        <button
          @click="adjustRestTimer(-10)"
          class="px-4 py-2 bg-slate-800 rounded-full text-slate-300"
        >
          -10s
        </button>
        <button
          @click="adjustRestTimer(30)"
          class="px-4 py-2 bg-slate-800 rounded-full text-slate-300"
        >
          +30s
        </button>
      </div>

      <div class="w-full max-w-xs mb-8">
        <input
          type="text"
          v-model="currentSet.notes"
          placeholder="Add notes for this set..."
          class="w-full bg-transparent border-b border-slate-600 text-center text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 py-2 transition-colors"
        />
      </div>

      <div
        v-if="nextStepInfo"
        class="mb-8 text-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50"
      >
        <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
          Up Next
        </div>
        <div class="font-bold text-blue-300 text-lg">
          {{ nextStepInfo.text }}
        </div>
        <div class="text-xs text-slate-500">{{ nextStepInfo.subtext }}</div>
      </div>

      <button
        @click="nextStep"
        class="bg-green-600 px-12 py-4 rounded-full font-bold text-white text-lg shadow-lg"
      >
        Start Next Set
      </button>
    </div>

    <div
      v-else-if="viewState === 'summary'"
      class="flex-1 flex flex-col p-4 overflow-y-auto"
    >
      <h2 class="text-2xl font-bold text-white mb-4">Summary</h2>

      <div class="space-y-4 mb-20">
        <div
          v-for="ex in activeSession"
          :key="ex.exerciseId"
          class="bg-slate-800 p-4 rounded-lg border border-slate-700 transition-all duration-200"
          :class="
            editingExerciseId === ex.exerciseId
              ? 'ring-2 ring-blue-500 bg-slate-800'
              : 'cursor-pointer hover:bg-slate-750'
          "
          @click="
            editingExerciseId !== ex.exerciseId
              ? (editingExerciseId = ex.exerciseId)
              : null
          "
        >
          <div class="flex justify-between items-center mb-3">
            <h3 class="font-bold text-blue-300">{{ ex.name }}</h3>
            <span
              v-if="editingExerciseId !== ex.exerciseId"
              class="text-xs text-slate-500 uppercase tracking-wide"
              >Edit</span
            >
            <button
              v-else
              @click.stop="editingExerciseId = null"
              class="text-green-400 text-xs font-bold uppercase bg-green-900/30 px-3 py-1 rounded"
            >
              Done
            </button>
          </div>

          <div v-if="editingExerciseId !== ex.exerciseId" class="space-y-3">
            <div
              v-for="(s, i) in ex.sets"
              :key="i"
              class="border-b border-slate-700/50 last:border-0 pb-1"
            >
              <div class="flex justify-between text-sm">
                <span class="text-slate-500">Set {{ i + 1 }}</span>
                <span class="text-white font-mono"
                  >{{ s.weight || 0 }}kg x {{ s.val }}</span
                >
              </div>
              <div v-if="s.notes" class="text-xs text-slate-400 italic mt-1">
                📝 {{ s.notes }}
              </div>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="(s, i) in ex.sets"
              :key="i"
              class="bg-slate-900/50 p-2 rounded border border-slate-700"
            >
              <div class="flex items-center gap-2 mb-2">
                <span class="text-slate-500 text-xs w-6 pt-2"
                  >#{{ i + 1 }}</span
                >
                <div class="flex-1">
                  <label class="text-[10px] text-slate-500 uppercase"
                    >Weight</label
                  >
                  <div
                    class="flex items-center bg-slate-900 rounded border border-slate-600 px-2"
                  >
                    <input
                      type="number"
                      v-model="s.weight"
                      class="w-full bg-transparent text-white text-right p-2 outline-none font-mono text-sm"
                      placeholder="0"
                    />
                    <span class="text-slate-500 text-xs ml-1">kg</span>
                  </div>
                </div>
                <div class="flex-1">
                  <label class="text-[10px] text-slate-500 uppercase">{{
                    s.type === "time" ? "Time" : "Reps"
                  }}</label>
                  <div
                    class="flex items-center bg-slate-900 rounded border border-slate-600 px-2"
                  >
                    <input
                      v-if="s.type === 'time'"
                      type="text"
                      v-model="s.val"
                      class="w-full bg-transparent text-white text-right p-2 outline-none font-mono text-sm"
                      placeholder="00:00"
                    />
                    <input
                      v-else
                      type="number"
                      v-model="s.val"
                      class="w-full bg-transparent text-white text-right p-2 outline-none font-mono text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <input
                type="text"
                v-model="s.notes"
                placeholder="Add notes..."
                class="w-full bg-transparent border-b border-slate-700 text-xs text-slate-300 p-1 focus:border-blue-500 outline-none"
              />
            </div>
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

    <div v-else class="flex-1 flex items-center justify-center">Loading...</div>
  </div>
</template>
