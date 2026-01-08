<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { db } from "../db";

const router = useRouter();
const route = useRoute();

const routineName = ref("");
const availableExercises = ref([]);
const selectedExercises = ref([]); // Array of exercise IDs
const isEditMode = computed(() => !!route.params.id);

onMounted(async () => {
  // 1. Load all exercises for the list
  availableExercises.value = await db.exercises.toArray();

  // 2. If in Edit Mode, load the routine data
  if (isEditMode.value) {
    const routineId = parseInt(route.params.id);

    // Get Name
    const routine = await db.routines.get(routineId);
    if (routine) {
      routineName.value = routine.name;
    }

    // Get Linked Exercises
    const links = await db.routineExercises
      .where("routineId")
      .equals(routineId)
      .toArray();
    selectedExercises.value = links.map((link) => link.exerciseId);
  }
});

const toggleExercise = (id) => {
  if (selectedExercises.value.includes(id)) {
    selectedExercises.value = selectedExercises.value.filter((x) => x !== id);
  } else {
    selectedExercises.value.push(id);
  }
};

const saveRoutine = async () => {
  if (!routineName.value || selectedExercises.value.length === 0) return;

  const routineId = isEditMode.value ? parseInt(route.params.id) : null;

  // Use a transaction to ensure data integrity
  await db.transaction("rw", db.routines, db.routineExercises, async () => {
    let targetId = routineId;

    if (isEditMode.value) {
      // UPDATE: Update name
      await db.routines.update(targetId, { name: routineName.value });

      // UPDATE: Clear old links to replace with new ones
      // (Easier than calculating diffs)
      await db.routineExercises.where("routineId").equals(targetId).delete();
    } else {
      // CREATE: Add new routine
      targetId = await db.routines.add({ name: routineName.value });
    }

    // SAVE LINKS: Create new relationships
    const links = selectedExercises.value.map((exId) => ({
      routineId: targetId,
      exerciseId: exId,
    }));
    await db.routineExercises.bulkAdd(links);
  });

  router.push("/");
};

const deleteRoutine = async () => {
  if (!confirm("Are you sure you want to delete this routine?")) return;

  const routineId = parseInt(route.params.id);

  await db.transaction("rw", db.routines, db.routineExercises, async () => {
    // Delete the routine info
    await db.routines.delete(routineId);
    // Delete the links to exercises
    await db.routineExercises.where("routineId").equals(routineId).delete();
  });

  router.push("/");
};
</script>

<template>
  <div class="p-4 min-h-screen pb-24">
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
        class="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
      />
    </div>

    <h2 class="text-sm text-slate-400 mb-2">Select Exercises</h2>
    <div class="space-y-2 mb-20">
      <div
        v-for="ex in availableExercises"
        :key="ex.id"
        @click="toggleExercise(ex.id)"
        class="p-3 rounded-lg border cursor-pointer flex justify-between items-center transition-colors"
        :class="
          selectedExercises.includes(ex.id)
            ? 'bg-blue-900/30 border-blue-500 text-blue-200'
            : 'bg-slate-800 border-slate-700 text-slate-300'
        "
      >
        <span>{{ ex.name }}</span>
        <span v-if="selectedExercises.includes(ex.id)">✓</span>
      </div>
    </div>

    <div
      class="fixed bottom-0 left-0 w-full p-4 bg-slate-900 border-t border-slate-800 flex flex-col gap-3"
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
        :disabled="!routineName || selectedExercises.length === 0"
        class="w-full bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 py-3 rounded-lg font-bold text-white shadow-lg"
      >
        {{ isEditMode ? "Update Routine" : "Save Routine" }}
      </button>
    </div>
  </div>
</template>
