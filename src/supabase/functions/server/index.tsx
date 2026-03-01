import { Hono } from "npm:hono@4.3.11";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { checkEmail, signUpUser, registerUser, getUserProfile, checkPhoneAvailability, updateUserProfile, cancelSignup, resetRegistration, completeRegistration, resetToPayment } from "./auth.ts";
import { verifyReferralCode, uploadListingPhoto, createListing, getUserListings, getAllActiveListings, getListingById, updateListing, deleteListing } from "./listings.ts";
import admin from "./admin.ts";
import referrals from "./referrals.ts";
import subscriptions from "./subscriptions.ts";
import rewards from "./rewards.ts";
import tasks from "./tasks.ts";
import cron from "./cron.ts";
import payment from "./payment.ts"; // ✅ 新增：付款路由
import payuni from "./payuni.ts"; // ✅ 新增：PayUni 續期收款路由
import dataValidation from "./data_validation.ts"; // ✅ 新增：數據驗證工具
import dataRepair from "./data_repair.ts"; // ✅ 新增：數據修復工具
import repairDefaultReferral from "./data_repair_default_referral.ts"; // ✅ 新增：修復默認推薦碼用戶
import adminSetup from "./admin_setup.ts"; // ✅ 新增：管理員設置工具
import userDiagnosis from "./admin_user_diagnosis.ts"; // ✅ 新增：用戶數據診斷工具
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // 初始化刊登照片 bucket
    const listingsBucketName = 'make-5c6718b9-listings-photos';
    // 初始化簽名圖片 bucket
    const signaturesBucketName = 'make-5c6718b9-signatures';
    
    // 列出所有 buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error(`⚠️ 無法列出 Storage Buckets:`, listError);
      return;
    }
    
    // 初始化刊登照片 bucket
    const listingsBucketExists = buckets?.some(bucket => bucket.name === listingsBucketName);

    if (!listingsBucketExists) {
      // 創建公開 bucket
      const { error: createError } = await supabase.storage.createBucket(listingsBucketName, {
        public: true,
        fileSizeLimit: 5242880
      });
      
      // 處理創建錯誤
      if (createError) {
        // 如果是 409 錯誤（資源已存在），視為成功
        if (createError.statusCode === '409') {
          console.log(`✅ Storage Bucket 已存在: ${listingsBucketName}`);
        } else {
          console.error(`❌ 創建 Storage Bucket 失敗:`, createError);
        }
      } else {
        console.log(`✅ 創建 Storage Bucket: ${listingsBucketName}`);
      }
    } else {
      console.log(`✅ Storage Bucket 已存在: ${listingsBucketName}`);
      
      // 確保現有 bucket 是公開的
      const { error: updateError } = await supabase.storage.updateBucket(listingsBucketName, {
        public: true,
        fileSizeLimit: 5242880
      });
      
      if (updateError) {
        console.error('⚠️ 更新 Bucket 權限失敗:', updateError);
      } else {
        console.log(`✅ 更新 Storage Bucket 權限為公開: ${listingsBucketName}`);
      }
    }

    // 初始化簽名圖片 bucket（私有）
    const signaturesBucketExists = buckets?.some(bucket => bucket.name === signaturesBucketName);

    if (!signaturesBucketExists) {
      // 創建私有 bucket
      const { error: createError } = await supabase.storage.createBucket(signaturesBucketName, {
        public: false,  // 簽名圖片是私有的
        fileSizeLimit: 2097152  // 2MB（簽名圖片較小）
      });
      
      if (createError) {
        if (createError.statusCode === '409') {
          console.log(`✅ Storage Bucket 已存在: ${signaturesBucketName}`);
        } else {
          console.error(`❌ 創建 Storage Bucket 失敗:`, createError);
        }
      } else {
        console.log(`✅ 創建 Storage Bucket: ${signaturesBucketName}`);
      }
    } else {
      console.log(`✅ Storage Bucket 已存在: ${signaturesBucketName}`);
      
      // 確保現有 bucket 是私有的
      const { error: updateError } = await supabase.storage.updateBucket(signaturesBucketName, {
        public: false,
        fileSizeLimit: 2097152
      });
      
      if (updateError) {
        console.error('⚠️ 更新 Bucket 權限失敗:', updateError);
      } else {
        console.log(`✅ 更新 Storage Bucket 權限為私有: ${signaturesBucketName}`);
      }
    }
  } catch (error) {
    console.error('⚠️ Storage Bucket 初始化錯誤:', error);
  }
};

// Initialize storage on startup
initializeStorage();

// Health check endpoint
app.get("/make-server-5c6718b9/health", (c) => {
  return c.json({ status: "ok" });
});

// Authentication Routes
app.post("/make-server-5c6718b9/auth/check-email", checkEmail);
app.post("/make-server-5c6718b9/auth/signup", signUpUser); // 新增：註冊路由（備用）
app.post("/make-server-5c6718b9/auth/register", registerUser);
app.get("/make-server-5c6718b9/auth/profile", getUserProfile);
app.put("/make-server-5c6718b9/auth/profile", updateUserProfile); // 新增：更新會員資料
app.post("/make-server-5c6718b9/auth/check-phone", checkPhoneAvailability);
app.delete("/make-server-5c6718b9/auth/cancel-signup", cancelSignup); // 新增：取消註冊
app.post("/make-server-5c6718b9/auth/reset-registration", resetRegistration); // 新增：重置註冊
app.post("/make-server-5c6718b9/auth/complete-registration", completeRegistration); // ✅ 新增：完成註冊
app.post("/make-server-5c6718b9/auth/reset-to-payment", resetToPayment); // ✅ 新增：重置到付款

// Listing Routes
app.post("/make-server-5c6718b9/listings/verify-referral-code", verifyReferralCode);
app.post("/make-server-5c6718b9/listings/upload-photo", uploadListingPhoto);
app.post("/make-server-5c6718b9/listings/create", createListing);
app.put("/make-server-5c6718b9/listings/:id", updateListing); // 新增：更新Listing
app.delete("/make-server-5c6718b9/listings/:id", deleteListing); // 新增：刪除Listing
app.get("/make-server-5c6718b9/listings/user", getUserListings);
app.get("/make-server-5c6718b9/listings/active", getAllActiveListings);
app.get("/make-server-5c6718b9/listings/:id", getListingById);

// Admin Routes
app.route("/make-server-5c6718b9/admin", admin);

// Referral Routes
app.route("/make-server-5c6718b9/referrals", referrals);

// Subscription Routes
app.route("/make-server-5c6718b9/subscriptions", subscriptions);

// Rewards Routes
app.route("/make-server-5c6718b9/rewards", rewards);

// Tasks Routes
app.route("/make-server-5c6718b9/tasks", tasks);

// Cron Routes
app.route("/make-server-5c6718b9/cron", cron);

// Payment Routes
app.route("/make-server-5c6718b9/payment", payment); // ✅ 新增：付款路由
app.route("/make-server-5c6718b9/payuni", payuni); // ✅ 新增：PayUni 續期收款路由

// Data Validation Routes
app.route("/make-server-5c6718b9/data-validation", dataValidation); // ✅ 新增：數據驗證工具

// Data Repair Routes
app.route("/make-server-5c6718b9/data-repair", dataRepair); // ✅ 新增：數據修復工具
app.route("/make-server-5c6718b9/data-repair-default-referral", repairDefaultReferral); // ✅ 新增：修復默認推薦碼用戶

// Admin Setup Routes
app.route("/make-server-5c6718b9/admin-setup", adminSetup); // ✅ 新增：管理員設置工具

// Admin User Diagnosis Routes
app.route("/make-server-5c6718b9/admin-user-diagnosis", userDiagnosis); // ✅ 新增：用戶數據診斷工具

Deno.serve(app.fetch);