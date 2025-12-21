/**
 * Uknow Platform API Server - V2 (Supabase Client + Postgres SQL)
 * 
 * Edge Function Entry Point
 * 
 * Version: V2 - Complete Refactor
 * Build: 2024-12-21
 * Architecture: Deno-compatible, Supabase Client + Direct Postgres
 */

import { Hono } from "npm:hono@4.3.11";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

// ========================================
// Import all route modules
// ========================================

// Database utilities
import * as kv from "../server/kv_store.tsx";
import { testDatabaseConnection } from "../server/db.ts";

// V1 routes (KV Store based)
import { 
  checkEmail, 
  signUpUser, 
  registerUser, 
  getUserProfile, 
  checkPhoneAvailability, 
  updateUserProfile, 
  cancelSignup 
} from "../server/auth.ts";
import { 
  verifyReferralCode, 
  uploadListingPhoto, 
  createListing, 
  getUserListings, 
  getAllActiveListings, 
  getListingById, 
  updateListing 
} from "../server/listings.ts";
import admin from "../server/admin.ts";
import referrals from "../server/referrals.ts";
import subscriptions from "../server/subscriptions.ts";
import rewards from "../server/rewards.ts";
import tasks from "../server/tasks.ts";
import cron from "../server/cron.ts";

// V2 routes (Postgres based)
import authV2 from "../server/auth_v2.ts";
import subscriptionsV2 from "../server/subscriptions_v2.ts";
import cronV2 from "../server/cron_v2.ts";
import referralsV2 from "../server/referrals_v2.ts";
import listingsV2 from "../server/listings_v2.ts";
import rewardsV2 from "../server/rewards_v2.ts";
import tasksV2 from "../server/tasks_v2.ts";
import withdrawalsV2 from "../server/withdrawals_v2.ts";
import profileV2 from "../server/profile_v2.ts";

// ========================================
// Initialize Hono App
// ========================================

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ========================================
// Initialize Supabase Storage Bucket
// ========================================

const initializeStorage = async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const bucketName = "make-5c6718b9-listings-photos";

    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((bucket) => bucket.name === bucketName);

    if (!bucketExists) {
      console.log(`Creating storage bucket: ${bucketName}`);
      const { error } = await supabase.storage.createBucket(bucketName, {
        public: false,
      });

      if (error) {
        console.error(`❌ Failed to create bucket: ${error.message}`);
      } else {
        console.log(`✅ Storage Bucket 已創建: ${bucketName}`);
      }
    } else {
      console.log(`✅ Storage Bucket 已存在: ${bucketName}`);
    }
  } catch (error) {
    console.error(`❌ Storage initialization error:`, error);
  }
};

// Initialize storage on startup
initializeStorage();

// Test database connection on startup
testDatabaseConnection();

// ========================================
// Root Health Check
// ========================================

app.get("/make-server-5c6718b9/health", async (c) => {
  try {
    // Test database connection
    await testDatabaseConnection();
    
    return c.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return c.json(
      {
        status: "error",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// ========================================
// V1 Routes (KV Store based) - Legacy
// ========================================

// Auth routes
app.post("/make-server-5c6718b9/auth/check-email", checkEmail);
app.post("/make-server-5c6718b9/auth/signup", signUpUser);
app.post("/make-server-5c6718b9/auth/register", registerUser);
app.get("/make-server-5c6718b9/auth/profile", getUserProfile);
app.post("/make-server-5c6718b9/auth/check-phone", checkPhoneAvailability);
app.put("/make-server-5c6718b9/auth/profile", updateUserProfile);
app.delete("/make-server-5c6718b9/auth/cancel-signup", cancelSignup);

// Listing routes
app.post("/make-server-5c6718b9/listings/verify-code", verifyReferralCode);
app.post("/make-server-5c6718b9/listings/upload-photo", uploadListingPhoto);
app.post("/make-server-5c6718b9/listings", createListing);
app.get("/make-server-5c6718b9/listings/my-listings", getUserListings);
app.get("/make-server-5c6718b9/listings/active", getAllActiveListings);
app.get("/make-server-5c6718b9/listings/:id", getListingById);
app.put("/make-server-5c6718b9/listings/:id", updateListing);

// Nested routers
app.route("/make-server-5c6718b9/admin", admin);
app.route("/make-server-5c6718b9/referrals", referrals);
app.route("/make-server-5c6718b9/subscriptions", subscriptions);
app.route("/make-server-5c6718b9/rewards", rewards);
app.route("/make-server-5c6718b9/tasks", tasks);
app.route("/make-server-5c6718b9/cron", cron);

// ========================================
// V2 Routes (Postgres based) - Primary
// ========================================

app.route("/make-server-5c6718b9/auth-v2", authV2);
app.route("/make-server-5c6718b9/subscriptions-v2", subscriptionsV2);
app.route("/make-server-5c6718b9/cron-v2", cronV2);
app.route("/make-server-5c6718b9/referrals-v2", referralsV2);
app.route("/make-server-5c6718b9/listings-v2", listingsV2);
app.route("/make-server-5c6718b9/rewards-v2", rewardsV2);
app.route("/make-server-5c6718b9/tasks-v2", tasksV2);
app.route("/make-server-5c6718b9/withdrawals-v2", withdrawalsV2);
app.route("/make-server-5c6718b9/profile-v2", profileV2);

// ========================================
// 404 Handler
// ========================================

app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      message: `Route ${c.req.path} not found`,
    },
    404,
  );
});

// ========================================
// Error Handler
// ========================================

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: err.message,
    },
    500,
  );
});

// ========================================
// Start Server
// ========================================

console.log("✅ Uknow Platform API Server V2 starting...");
console.log("✅ Route prefix: /make-server-5c6718b9");

Deno.serve(app.fetch);
