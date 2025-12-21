/**
 * Date Helper Utilities
 * 
 * Provides common date manipulation functions for subscription and reward systems
 * 
 * @module dateHelpers
 */

/**
 * Add days to a date
 * 
 * @param date - Base date
 * @param days - Number of days to add
 * @returns {Date} New date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date
 * 
 * @param date - Base date
 * @param months - Number of months to add
 * @returns {Date} New date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Add years to a date
 * 
 * @param date - Base date
 * @param years - Number of years to add
 * @returns {Date} New date
 */
export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Calculate subscription end date (1 year from start)
 * 
 * @param startDate - Subscription start date
 * @returns {Date} End date (start + 1 year)
 */
export function calculateSubscriptionEndDate(startDate: Date): Date {
  return addYears(startDate, 1);
}

/**
 * Calculate grace period end date (end date + 60 days)
 * 
 * @param endDate - Subscription end date
 * @returns {Date} Grace period end date
 */
export function calculateGracePeriodEndDate(endDate: Date): Date {
  return addDays(endDate, 60);
}

/**
 * Calculate reward schedule date
 * 
 * @param refereeCreatedAt - Date when referee was created
 * @param monthNumber - Month number (1-12)
 * @returns {Date} Scheduled reward date
 */
export function calculateRewardScheduleDate(refereeCreatedAt: Date, monthNumber: number): Date {
  // Reward is issued on the same day of the month, N months later
  // For example: If referee created on 2024-01-15, month 2 reward is on 2024-03-15
  return addMonths(refereeCreatedAt, monthNumber);
}

/**
 * Get month key in format YYYY-MM
 * 
 * @param date - Date to convert
 * @returns {string} Month key (e.g., "2024-12")
 */
export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get today's date at midnight (00:00:00)
 * 
 * @returns {Date} Today at midnight
 */
export function getTodayMidnight(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Check if a date is in the past
 * 
 * @param date - Date to check
 * @returns {boolean} True if date is in the past
 */
export function isDateInPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Check if a date is in the future
 * 
 * @param date - Date to check
 * @returns {boolean} True if date is in the future
 */
export function isDateInFuture(date: Date): boolean {
  return date > new Date();
}

/**
 * Check if two dates are on the same day
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @returns {boolean} True if same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Format date as ISO date string (YYYY-MM-DD)
 * 
 * @param date - Date to format
 * @returns {string} ISO date string
 */
export function formatISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse date string to Date object
 * 
 * @param dateString - Date string (ISO format)
 * @returns {Date} Date object
 */
export function parseDate(dateString: string): Date {
  return new Date(dateString);
}
