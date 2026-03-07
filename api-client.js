const API_BASE = "https://mtg-binder-backend.onrender.com"
const ACCESS_TOKEN_STORAGE_KEY = "mtg-binder-write-token"

export const READONLY_QR_ACCESS_TOKEN = "mtg-binder-readonly-token"

export function buildShareUrl() {
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set("access", READONLY_QR_ACCESS_TOKEN)
  return url.toString()
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || ""
}

export function setAccessToken(token) {
  if (!token) return
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
}

export function bootstrapAccessTokenFromUrl() {
  const url = new URL(window.location.href)
  const tokenFromUrl = url.searchParams.get("access")

  if (!tokenFromUrl) {
    return getAccessToken()
  }

  setAccessToken(tokenFromUrl)
  url.searchParams.delete("access")
  window.history.replaceState({}, "", url.toString())

  return tokenFromUrl
}

async function apiFetch(path, options = {}) {
  const token = getAccessToken()

  const headers = {
    ...(options.headers || {})
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  if (token) {
    headers["x-access-token"] = token
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  })

  let data = null
  const contentType = response.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    data = await response.json()
  }

  if (!response.ok) {
    throw new Error(data?.error || `API Fehler ${response.status}`)
  }

  return data
}

export async function verifyAccess() {
  return apiFetch("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({})
  })
}

export async function loadCardsFromApi() {
  return apiFetch("/api/cards", {
    method: "GET"
  })
}

export async function createCardInApi(card) {
  return apiFetch("/api/cards", {
    method: "POST",
    body: JSON.stringify(card)
  })
}

export async function updateCardInApi(id, payload) {
  return apiFetch(`/api/cards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  })
}

export async function deleteCardInApi(id) {
  return apiFetch(`/api/cards/${encodeURIComponent(id)}`, {
    method: "DELETE"
  })
}