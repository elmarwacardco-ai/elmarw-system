// Public product/category endpoints are not suitable for administrator authorization.
// Require a successful read of an admin-only API resource before opening the dashboard.
export async function requireAdminSession(read, token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Administrator session missing')
  }
  const result = await read('clients', token)
  if (!Array.isArray(result)) throw new Error('Administrator permission check failed')
  return true
}
