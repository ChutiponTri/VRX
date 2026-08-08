import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").order("desc").take(20);
  },
});

export const createUser = mutation({
  args: {
    name: v.string(),
    age: v.number(),
    profile: v.union(v.literal("General"), v.literal("Patient")),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", {
      name: args.name,
      age: args.age,
      profile: args.profile,
    });
    return userId;
  },
});

export const getUserStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(5);
    
    return { user, scores };
  },
});

export const saveScore = mutation({
  args: {
    userId: v.id("users"),
    gameName: v.string(),
    mode: v.string(),
    score: v.number(),
    preGameHR: v.number(),
    postGameHR: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("scores", {
      userId: args.userId,
      gameName: args.gameName,
      mode: args.mode,
      score: args.score,
      preGameHR: args.preGameHR,
      postGameHR: args.postGameHR,
      playedAt: Date.now(),
    });
  },
});

export const saveTrainingSession = mutation({
  args: {
    userId: v.id("users"),
    gameName: v.string(),
    difficulty: v.string(),
    totalScore: v.number(),
    roundsCompleted: v.number(),
    hrTargetMin: v.number(),
    hrTargetMax: v.number(),
    hrTimeline: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Clean the array (remove any 0s where the sensor dropped out)
    const validHRs = args.hrTimeline.filter(hr => hr > 0);
    
    // 2. Pre-calculate Peak and Average on the server
    const hrPeak = validHRs.length > 0 ? Math.max(...validHRs) : 0;
    const hrSum = validHRs.reduce((a, b) => a + b, 0);
    const hrAverage = validHRs.length > 0 ? Math.round(hrSum / validHRs.length) : 0;

    // 3. Save as a single document (1 Write Operation!)
    await ctx.db.insert("training_sessions", {
      userId: args.userId,
      gameName: args.gameName,
      difficulty: args.difficulty,
      totalScore: args.totalScore,
      roundsCompleted: args.roundsCompleted,
      hrTargetMin: args.hrTargetMin,
      hrTargetMax: args.hrTargetMax,
      hrAverage: hrAverage,
      hrPeak: hrPeak,
      hrTimeline: args.hrTimeline, // Store the array for Recharts/Chart.js
      playedAt: Date.now(),
    });
  },
});

// Fetch just the metadata for the list view (Saves bandwidth!)
export const getTrainingSessionsSummary = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("training_sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);
    
    // Server-side mapping to strip out the heavy hrTimeline array
    return sessions.map((session) => {
      const { hrTimeline, ...summary } = session;
      return summary;
    });
  },
});

// Fetch the full document ONLY when the user wants to chart/export it
export const getSessionFullDetails = query({
  args: { sessionId: v.id("training_sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

// Fetch Normal Arcade Sessions
export const getNormalSessions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50); // Adjust limit as needed
  },
});