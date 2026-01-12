<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { db } from "../db";

const router = useRouter();
const route = useRoute();

const routineName = ref("");
const isEditMode = computed(() => !!route.params.id);

// Main list of exercises in the editor
const exercises = ref([]);

// --- LIBRARY MODAL STATE ---
const showLibrary = ref(false);
const libraryExercises = ref([]);
const searchQuery = ref("");

onMounted(async () => {
  // 1. Load the "Library" (All unique exercises ever saved)
  libraryExercises.value = await db.exercises.toArray();

  // 2. Load Routine if in Edit Mode
  if (isEditMode.value) {
    const routineId = parseInt(route.params.id);
    const routine = await db.routines.get(routineId);
    if (routine) routineName.value = routine.name;

    const links = await db.routineExercises
      .where("routineId")
      .equals(routineId)
      .toArray();

    for (const link of links) {
      const exData = await db.exercises.get(link.exerciseId);
      exercises.value.push({
        tempId: Date.now() + Math.random(),
        id: link.exerciseId,
        name: exData ? exData.name : "Unknown",
        description: exData ? exData.description : "",
        sets: link.targetSets || 3,
        weight: link.targetWeight || 0,
        target: link.targetVal || (link.type === "time" ? "01:00" : 10),
        type: link.type || "reps",
        rest: link.targetRest || "01:30",
      });
    }
  }
});

// --- ACTIONS ---

const addEmptyExercise = () => {
  exercises.value.push({
    tempId: Date.now() + Math.random(),
    id: null,
    name: "",
    description: "",
    sets: 3,
    weight: 0,
    target: 10,
    type: "reps",
    rest: "01:30",
  });
};

const removeExercise = (index) => {
  exercises.value.splice(index, 1);
};

// --- LIBRARY LOGIC ---

const filteredLibrary = computed(() => {
  if (!searchQuery.value) return libraryExercises.value;
  const q = searchQuery.value.toLowerCase();
  return libraryExercises.value.filter((e) => e.name.toLowerCase().includes(q));
});

const openLibrary = async () => {
  // Refresh library in case new ones were added recently
  libraryExercises.value = await db.exercises.toArray();
  showLibrary.value = true;
};

const importExercise = (ex) => {
  // Create a new instance based on the library data
  exercises.value.push({
    tempId: Date.now() + Math.random(),
    id: ex.id, // Keep the DB ID so we link correctly
    name: ex.name,
    description: ex.description || "",
    // Defaults for the new routine (User edits these)
    sets: 3,
    weight: 0,
    target: 10,
    type: "reps",
    rest: "01:30",
  });
  // Note: We don't close the modal automatically, allowing multi-select.
};

// --- TYPE SWITCHING & INPUTS ---
const setType = (index, newType) => {
  const ex = exercises.value[index];
  if (newType === "time" && !String(ex.target).includes(":")) {
    ex.target = "01:00";
  }
  if (newType === "reps" && String(ex.target).includes(":")) {
    ex.target = 10;
  }
  ex.type = newType;
};

const validateTimeInput = (event, index, field) => {
  let val = event.target.value;
  val = val.replace(/[^0-9:]/g, "");
  if (val.length > 5) val = val.slice(0, 5);
  exercises.value[index][field] = val;
};

// --- VALIDATION & SAVE ---
const isFormValid = computed(() => {
  if (!routineName.value) return false;
  if (exercises.value.length === 0) return false;

  const timeRegex = /^\d{1,2}:\d{2}$/;

  return exercises.value.every((ex) => {
    if (!ex.name.trim()) return false;
    if (ex.sets < 1) return false;
    if (!timeRegex.test(ex.rest)) return false;
    if (ex.type === "time") {
      return timeRegex.test(ex.target);
    } else {
      return ex.target > 0;
    }
  });
});

const saveRoutine = async () => {
  if (!isFormValid.value) return;

  const routineId = isEditMode.value ? parseInt(route.params.id) : null;

  await db.transaction(
    "rw",
    db.routines,
    db.routineExercises,
    db.exercises,
    async () => {
      let targetId = routineId;

      if (isEditMode.value) {
        await db.routines.update(targetId, { name: routineName.value });
        await db.routineExercises.where("routineId").equals(targetId).delete();
      } else {
        targetId = await db.routines.add({ name: routineName.value });
      }

      const links = [];

      for (const ex of exercises.value) {
        let exerciseId = ex.id;

        // Ensure exercise exists or update description
        const existing = await db.exercises
          .where("name")
          .equals(ex.name.trim())
          .first();

        if (existing) {
          exerciseId = existing.id;
          await db.exercises.update(exerciseId, {
            description: ex.description,
          });
        } else {
          exerciseId = await db.exercises.add({
            name: ex.name.trim(),
            description: ex.description,
          });
        }

        links.push({
          routineId: targetId,
          exerciseId: exerciseId,
          targetSets: parseInt(ex.sets),
          targetWeight: parseFloat(ex.weight),
          targetVal: ex.target,
          type: ex.type,
          targetRest: ex.rest,
        });
      }

      await db.routineExercises.bulkAdd(links);
    }
  );

  router.push("/");
};

const deleteRoutine = async () => {
  if (!confirm("Delete routine?")) return;
  const routineId = parseInt(route.params.id);
  await db.transaction("rw", db.routines, db.routineExercises, async () => {
    await db.routines.delete(routineId);
    await db.routineExercises.where("routineId").equals(routineId).delete();
  });
  router.push("/");
};
</script>

<template>
  <div class="p-4 min-h-screen pb-32 text-slate-100 relative">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-xl font-bold">
        {{ isEditMode ? "Edit Routine" : "New Routine" }}
      </h1>
      <button @click="router.push('/')" class="text-slate-400">Cancel</button>
    </div>

    <div class="mb-6">
      <label class="block text-sm text-slate-400 mb-1">Routine Name</label>
      <input
        v-model="routineName"
        type="text"
        placeholder="e.g. Pull Day"
        class="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 outline-none focus:border-blue-500"
      />
    </div>

    <h2 class="text-sm text-slate-400 mb-4">Exercises</h2>

    <div class="space-y-6">
      <div
        v-for="(ex, index) in exercises"
        :key="ex.tempId"
        class="bg-slate-800 rounded-lg border border-slate-700 p-4 relative"
      >
        <button
          @click="removeExercise(index)"
          class="absolute top-2 right-2 text-slate-500 hover:text-red-400 p-2"
        >
          ✕
        </button>

        <div class="mb-4 pr-8">
          <input
            v-model="ex.name"
            type="text"
            placeholder="Exercise Name"
            class="bg-transparent text-lg font-bold text-white placeholder-slate-500 w-full outline-none mb-1 border-b border-transparent focus:border-blue-500"
          />
          <input
            v-model="ex.description"
            type="text"
            placeholder="Description (optional)"
            class="bg-transparent text-sm text-slate-400 placeholder-slate-600 w-full outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 flex bg-slate-900 rounded p-1 mb-1">
            <button
              @click="setType(index, 'reps')"
              class="flex-1 py-1 text-xs rounded transition-colors"
              :class="
                ex.type === 'reps' ? 'bg-blue-600 text-white' : 'text-slate-400'
              "
            >
              Reps
            </button>
            <button
              @click="setType(index, 'time')"
              class="flex-1 py-1 text-xs rounded transition-colors"
              :class="
                ex.type === 'time' ? 'bg-blue-600 text-white' : 'text-slate-400'
              "
            >
              Time
            </button>
          </div>

          <div>
            <label class="text-xs text-slate-500">Target Sets</label>
            <input
              type="number"
              min="1"
              v-model="ex.sets"
              class="w-full bg-slate-900 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="text-xs text-slate-500">Target Weight</label>
            <input
              type="number"
              v-model="ex.weight"
              class="w-full bg-slate-900 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="text-xs text-slate-500">
              {{ ex.type === "reps" ? "Target Reps" : "Target Time" }}
            </label>
            <input
              v-if="ex.type === 'reps'"
              type="number"
              min="1"
              v-model="ex.target"
              class="w-full bg-slate-900 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              v-else
              type="text"
              placeholder="01:00"
              :value="ex.target"
              @input="(e) => validateTimeInput(e, index, 'target')"
              class="w-full bg-slate-900 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
              :class="{
                'border border-red-500': !/^\d{1,2}:\d{2}$/.test(ex.target),
              }"
            />
          </div>

          <div>
            <label class="text-xs text-slate-500">Rest (mm:ss)</label>
            <input
              type="text"
              placeholder="01:30"
              :value="ex.rest"
              @input="(e) => validateTimeInput(e, index, 'rest')"
              class="w-full bg-slate-900 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
              :class="{
                'border border-red-500': !/^\d{1,2}:\d{2}$/.test(ex.rest),
              }"
            />
          </div>
        </div>
      </div>

      <div class="flex gap-3">
        <button
          @click="addEmptyExercise"
          class="flex-1 py-3 border-2 border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 transition-colors font-bold text-sm"
        >
          + Create New
        </button>
        <button
          @click="openLibrary"
          class="flex-1 py-3 bg-slate-800 rounded-lg text-blue-400 hover:bg-slate-700 transition-colors font-bold text-sm border border-slate-700"
        >
          Import from Library
        </button>
      </div>
    </div>

    <div
      v-if="showLibrary"
      class="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
    >
      <div
        class="bg-slate-900 w-full max-w-md h-[80vh] rounded-xl flex flex-col border border-slate-700 shadow-2xl"
      >
        <div
          class="p-4 border-b border-slate-800 flex justify-between items-center"
        >
          <h3 class="font-bold text-white">Select Exercises</h3>
          <button @click="showLibrary = false" class="text-slate-400 text-sm">
            Done
          </button>
        </div>

        <div class="p-4">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search exercises..."
            class="w-full bg-slate-800 text-white p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            autofocus
          />
        </div>

        <div class="flex-1 overflow-y-auto p-4 pt-0 space-y-2">
          <div
            v-for="item in filteredLibrary"
            :key="item.id"
            @click="importExercise(item)"
            class="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center cursor-pointer hover:border-blue-500 active:bg-slate-700"
          >
            <div>
              <div class="font-bold text-slate-200">{{ item.name }}</div>
              <div class="text-xs text-slate-500 truncate max-w-[200px]">
                {{ item.description }}
              </div>
            </div>
            <div class="text-blue-400 font-bold text-xl">+</div>
          </div>

          <div
            v-if="filteredLibrary.length === 0"
            class="text-center text-slate-500 mt-8"
          >
            No matching exercises found.
          </div>
        </div>
      </div>
    </div>

    <div
      class="fixed bottom-0 left-0 w-full p-4 bg-slate-900 border-t border-slate-800 flex flex-col gap-3 z-50"
    >
      <button
        v-if="isEditMode"
        @click="deleteRoutine"
        class="w-full text-red-400 py-2 text-sm font-bold"
      >
        Delete Routine
      </button>

      <button
        @click="saveRoutine"
        :disabled="!isFormValid"
        class="w-full py-3 rounded-lg font-bold text-white shadow-lg transition-colors"
        :class="
          !isFormValid
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-500'
        "
      >
        {{ isEditMode ? "Update Routine" : "Save Routine" }}
      </button>
    </div>
  </div>
</template>
