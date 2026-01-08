<script setup>
import { ref } from "vue";
import { db, seedDatabase } from "../db"; // Import seedDatabase to ensure clean restart
import { useRouter } from "vue-router";

const router = useRouter();
const statusMsg = ref("");

// 1. EXPORT FUNCTION
const exportData = async () => {
  try {
    const data = {
      exercises: await db.exercises.toArray(),
      routines: await db.routines.toArray(),
      routineExercises: await db.routineExercises.toArray(),
      workoutLogs: await db.workoutLogs.toArray(),
      setLogs: await db.setLogs.toArray(),
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusMsg.value = "Export successful!";
  } catch (err) {
    console.error(err);
    statusMsg.value = "Export failed. Check console.";
  }
};

// 2. IMPORT FUNCTION
const triggerImport = () => {
  document.getElementById("fileUpload").click();
};

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      await db.transaction(
        "rw",
        db.exercises,
        db.routines,
        db.routineExercises,
        db.workoutLogs,
        db.setLogs,
        async () => {
          await db.exercises.clear();
          await db.routines.clear();
          await db.routineExercises.clear();
          await db.workoutLogs.clear();
          await db.setLogs.clear();

          if (data.exercises) await db.exercises.bulkAdd(data.exercises);
          if (data.routines) await db.routines.bulkAdd(data.routines);
          if (data.routineExercises)
            await db.routineExercises.bulkAdd(data.routineExercises);
          if (data.workoutLogs) {
            const logs = data.workoutLogs.map((l) => ({
              ...l,
              startTime: new Date(l.startTime),
              endTime: new Date(l.endTime),
            }));
            await db.workoutLogs.bulkAdd(logs);
          }
          if (data.setLogs) await db.setLogs.bulkAdd(data.setLogs);
        }
      );

      statusMsg.value = "Import successful! Reloading...";
      setTimeout(() => window.location.reload(), 1000); // Reload to refresh state
    } catch (err) {
      console.error(err);
      statusMsg.value = "Import failed. Invalid JSON?";
    }
  };
  reader.readAsText(file);
};

// 3. DANGER: WIPE DATABASE
const wipeDatabase = async () => {
  if (
    !confirm(
      "⚠️ ARE YOU SURE?\n\nThis will permanently delete ALL workouts, routines, and exercises.\n\nThis cannot be undone."
    )
  ) {
    return;
  }

  try {
    // Delete the entire database
    await db.delete();

    // Reload the page.
    // On reload, 'db.js' will re-initialize the DB structure
    // and 'App.vue' will call seedDatabase() to give you the fresh default exercises.
    window.location.reload();
  } catch (err) {
    console.error("Could not delete DB:", err);
    statusMsg.value = "Error wiping database.";
  }
};
</script>

<template>
  <div class="p-6 max-w-lg mx-auto min-h-screen text-slate-100 pb-20">
    <div class="flex items-center mb-8">
      <button @click="router.push('/')" class="text-slate-400 mr-4">
        ← Back
      </button>
      <h1 class="text-2xl font-bold">Data Management</h1>
    </div>

    <div class="space-y-6">
      <div class="bg-slate-800 p-6 rounded-lg border border-slate-700">
        <h2 class="text-xl font-bold mb-2 text-green-400">Backup Data</h2>
        <p class="text-sm text-slate-400 mb-4">
          Download a copy of your database to your phone.
        </p>
        <button
          @click="exportData"
          class="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded font-bold border border-slate-600"
        >
          ⬇️ Download JSON
        </button>
      </div>

      <div class="bg-slate-800 p-6 rounded-lg border border-slate-700">
        <h2 class="text-xl font-bold mb-2 text-blue-400">Restore Data</h2>
        <p class="text-sm text-slate-400 mb-4">
          Overwrite current data with a backup file.
        </p>
        <input
          type="file"
          id="fileUpload"
          class="hidden"
          accept=".json"
          @change="handleFileUpload"
        />
        <button
          @click="triggerImport"
          class="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded font-bold border border-slate-600"
        >
          ⬆️ Upload JSON
        </button>
      </div>

      <div class="mt-12 pt-6 border-t border-slate-700">
        <h3
          class="text-red-500 font-bold mb-2 text-sm uppercase tracking-wider"
        >
          Danger Zone
        </h3>
        <button
          @click="wipeDatabase"
          class="w-full border border-red-900 bg-red-900/20 text-red-500 hover:bg-red-900/40 py-3 rounded font-bold transition-colors"
        >
          💣 Wipe Database & Reset
        </button>
        <p class="text-center text-xs text-slate-500 mt-2">
          Deletes everything and restores default exercises.
        </p>
      </div>

      <div
        v-if="statusMsg"
        class="text-center font-bold text-yellow-400 mt-4 bg-slate-800 p-2 rounded"
      >
        {{ statusMsg }}
      </div>
    </div>
  </div>
</template>
