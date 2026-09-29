/**
 * Shared service type detection helper
 * Used by both server-side pricing engine and client UI to ensure
 * service classification cannot drift between implementations.
 */

/**
 * Checks if a service name matches the followers category (SMM account boosting).
 * Includes followers, subscribers, members, etc. for account growth.
 */
export function isFollowersService(serviceName: string): boolean {
  return /follower|subscriber|member/i.test(serviceName);
}
