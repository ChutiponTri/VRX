import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    age: v.number(),
    profile: v.union(v.literal("General"), v.literal("Patient")),
  }),
  
  // Normal Arcade Mode Scores
  scores: defineTable({
    userId: v.id("users"),
    gameName: v.string(),
    mode: v.string(),
    score: v.number(),
    preGameHR: v.number(),
    postGameHR: v.number(), 
    playedAt: v.number(),
  }).index("by_user", ["userId"]),

  // NEW: Pro Training Mode Sessions
  training_sessions: defineTable({
    userId: v.id("users"),
    gameName: v.string(),
    difficulty: v.string(),
    totalScore: v.number(),
    roundsCompleted: v.number(), // E.g., 10
    
    // Analytics for easy dashboard reading
    hrTargetMin: v.number(),
    hrTargetMax: v.number(),
    hrAverage: v.number(),
    hrPeak: v.number(),
    
    // The time-series data for charting (Array of numbers)
    hrTimeline: v.array(v.number()), 
    
    playedAt: v.number(),
  }).index("by_user", ["userId"]),
});