import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";

// Version: V2 - Prisma Removed, Supabase Client + Postgres SQL
// Build: 2024-12-21
// Architecture: Deno-compatible, no native binaries

import * as kv from "./kv_store.tsx";
import { checkEmail, signUpUser, registerUser, getUserProfile, checkPhoneAvailability, updateUserProfile, cancelSignup } from "./auth.ts";
import { verifyReferralCode, uploadListingPhoto, createListing, getUserListings, getAllActiveListings, getListingById, updateListing } from "./listings.ts";
import admin from "./admin.ts";
import referrals from "./referrals.ts";
import subscriptions from "./subscriptions.ts";
import rewards from "./rewards.ts";
import tasks from "./tasks.ts";
import cron from "./cron.ts";
import authV2 from "./auth_v2.ts";
import subscriptionsV2 from "./subscriptions_v2.ts";
import cronV2 from "./cron_v2.ts";
import referralsV2 from "./referrals_v2.ts";
import listingsV2 from "./listings_v2.ts";
import rewardsV2 from "./rewards_v2.ts";
import tasksV2 from "./tasks_v2.ts";
import withdrawalsV2 from "./withdrawals_v2.ts";
import profileV2 from "./profile_v2.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { testDatabaseConnection } from "./db.ts";

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

// Initialize Supabase Storage Bucket for listing photos
const initializeStorage = async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketName = 'make-5c6718b9-listings-photos';
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);

    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, {
        public: true, // 公開存取
        fileSizeLimit: 5242880 // 5MB
      });
      console.log(`✅ 創建 Storage Bucket: ${bucketName}`);
    } else {
      console.log(`✅ Storage Bucket 已存在: ${bucketName}`);
    }
  } catch (error) {
    console.error('⚠️ Storage Bucket 初始化錯誤:', error);
  }
};

// Initialize storage on startup
initializeStorage();

// Initialize database connection
const initializeDatabase = async () => {
  try {
    const isConnected = await testDatabaseConnection();
    if (isConnected) {
      console.log('✅ PostgreSQL connection successful');
    } else {
      console.error('❌ PostgreSQL connection failed');
    }
  } catch (error) {
    console.error('⚠️ Database initialization error:', error);
  }
};

initializeDatabase();

// Health check endpoint
app.get("/make-server-5c6718b9/health", async (c) => {
  const dbStatus = await testDatabaseConnection();
  return c.json({ 
    status: "ok",
    database: dbStatus ? "connected" : "disconnected"
  });
});

// Authentication Routes
app.post("/make-server-5c6718b9/auth/check-email", checkEmail);
app.post("/make-server-5c6718b9/auth/signup", signUpUser); // 新增：註冊路由（備用）
app.post("/make-server-5c6718b9/auth/register", registerUser);
app.get("/make-server-5c6718b9/auth/profile", getUserProfile);
app.put("/make-server-5c6718b9/auth/profile", updateUserProfile); // 新增：更新會員資料
app.post("/make-server-5c6718b9/auth/check-phone", checkPhoneAvailability);
app.delete("/make-server-5c6718b9/auth/cancel-signup", cancelSignup); // 新增：取消註冊

// Listing Routes
app.post("/make-server-5c6718b9/listings/verify-referral-code", verifyReferralCode);
app.post("/make-server-5c6718b9/listings/upload-photo", uploadListingPhoto);
app.post("/make-server-5c6718b9/listings/create", createListing);
app.put("/make-server-5c6718b9/listings/:id", updateListing); // 新增：更新Listing
app.get("/make-server-5c6718b9/listings/user", getUserListings);
app.get("/make-server-5c6718b9/listings/active", getAllActiveListings);
app.get("/make-server-5c6718b9/listings/:id", getListingById);

// Admin Routes
app.route("/make-server-5c6718b9/admin", admin);

// Referral Routes
app.route("/make-server-5c6718b9/referrals", referrals);
app.route("/make-server-5c6718b9/referrals-v2", referralsV2);

// Listing Routes V2
app.route("/make-server-5c6718b9/listings-v2", listingsV2);

// Subscription Routes
app.route("/make-server-5c6718b9/subscriptions", subscriptions);
app.route("/make-server-5c6718b9/subscriptions-v2", subscriptionsV2);

// Rewards Routes
app.route("/make-server-5c6718b9/rewards", rewards);
app.route("/make-server-5c6718b9/rewards-v2", rewardsV2);

// Tasks Routes
app.route("/make-server-5c6718b9/tasks", tasks);
app.route("/make-server-5c6718b9/tasks-v2", tasksV2);

// Withdrawals Routes
app.route("/make-server-5c6718b9/withdrawals-v2", withdrawalsV2);

// Profile Routes
app.route("/make-server-5c6718b9/profile-v2", profileV2);

// Cron Routes
app.route("/make-server-5c6718b9/cron", cron);
app.route("/make-server-5c6718b9/cron-v2", cronV2);

// Auth V2 Routes
app.route("/make-server-5c6718b9/auth-v2", authV2);

// Export app for Edge Function deployment
export default app.fetch;

// Start server if running directly (local development)
if (import.meta.main) {
  Deno.serve(app.fetch);
}