/**
 * Uknow Platform API Server - Figma Make Deployment Alias
 * 
 * Figma Make 的部署功能會嘗試部署到 "make-server"
 * 此文件將請求轉發到實際的服務器 "make-server-5c6718b9"
 */

// 直接導出實際服務器的邏輯
export { default } from '../server/index.tsx';
