async function request(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error( data?.message || `Request failed (${res.status})` )
    return data
}

export const getCurrentUser = () => request( '/api/auth/me').then( (d) => d.user )
export const loginAsGuest = () => request( '/api/auth/guest', { method: 'POST' }).then( (d) => d.user )
export const loginWithGoogle = (credential) => request( '/api/auth/google', { method : 'POST', body: JSON.stringify({ credential }) }).then( (d) => d.user )
export const logout = () => request('/api/auth/logout', { method : 'POST' })