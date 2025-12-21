/**
 * Uknow Platform API Server - V2 (Supabase Client + Postgres SQL)
 * 
 * Edge Function Entry Point for Figma Make Deployment
 * 
 * 此文件是標準 Supabase Edge Function 的入口點
 * 實際的服務器邏輯在 ../server/index.tsx
 */

// 直接導出 server 目錄的主文件
export { default } from '../server/index.tsx';
