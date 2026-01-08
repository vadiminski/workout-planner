import Dexie from "dexie";

export const db = new Dexie("WorkoutDB");

db.version(2).stores({
  // 1. The Library & Templates
  exercises: "++id, name", // e.g., "Bench Press"
  routines: "++id, name", // e.g., "Push Day"

  // Link table: Which exercises are in which routine?
  // We index 'routineId' to quickly load a full plan.
  routineExercises: "++id, routineId, exerciseId",

  // 2. The Logs (History)
  // A workout session
  workoutLogs: "++id, routineId, startTime, endTime",

  // The actual sets performed
  // We index 'workoutLogId' to load a past session
  setLogs: "++id, workoutLogId, exerciseId",
});

// Helper to seed default exercises if empty
export async function seedDatabase() {
  const count = await db.exercises.count();
  if (count === 0) {
    await db.exercises.bulkAdd([
      { name: "Squat" },
      { name: "Bench Press" },
      { name: "Deadlift" },
      { name: "Overhead Press" },
      { name: "Pull Up" },
      { name: "Dumbbell Row" },
    ]);
  }
}
