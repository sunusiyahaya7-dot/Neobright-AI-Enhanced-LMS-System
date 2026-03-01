/// <reference types="vite/client" />
import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { auth } from "../firebase";

/**
 * API client with automatic Firebase ID token injection.
 * All requests to Flask backend include Authorization header.
 */
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 30000,
});

/**
 * Request interceptor: Attach Firebase ID token to all requests.
 */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      if (!config.headers) {
        config.headers = {} as any;
      }
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle token expiration and 401 errors.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const backendError = error.response?.data?.error;
      const backendDetails = error.response?.data?.details;
      console.error(
        "Unauthorized:",
        backendError || "Request unauthorized",
        backendDetails ? `(details: ${backendDetails})` : ""
      );

      // Try to refresh the token once before giving up
      const user = auth.currentUser;
      if (user && !error.config._retried) {
        error.config._retried = true;
        try {
          const newToken = await user.getIdToken(true);
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return api.request(error.config);
        } catch {
          // Token refresh failed — sign out and redirect
        }
      }

      // Sign out and redirect to login
      await auth.signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;