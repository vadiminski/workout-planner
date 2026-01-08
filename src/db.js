import Dexie from "dexie";

export const db = new Dexie("WorkoutDB");

db.version(3)
  .stores({
    // Bumped version to 3
    // Added 'description' to exercises
    exercises: "++id, name, description",

    routines: "++id, name",

    // Added 'type' and target columns to schema definition for clarity
    // (Dexie allows extra props, but good to document)
    routineExercises: "++id, routineId, exerciseId, type",

    workoutLogs: "++id, routineId, startTime, endTime",
    setLogs: "++id, workoutLogId, exerciseId",
  })
  .upgrade((tx) => {
    // Migration logic if needed (Dexie handles adding new columns automatically)
  });

// We REMOVE the automatic seedDatabase call since you want to start empty
export async function seedDatabase() {
  // Empty - User creates their own exercises
}
