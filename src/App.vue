<script setup>
import { onMounted } from "vue";
import { seedDatabase } from "./db";

// Ensure DB is seeded on app load
onMounted(() => {
  seedDatabase();
});
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-100 font-sans">
    <router-view />
  </div>
</template>
