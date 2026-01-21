import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { getIdToken } from "../services/authService";

/**
 * API client with automatic Firebase ID token injection.
 * All requests to Flask backend include Authorization header.
 */
const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "http://localhost:5000/api",
  timeout: 30000,
});

/**
 * Request interceptor: Attach Firebase ID token to all requests.
 */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getIdToken();
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
 * Response interceptor: Handle token expiration.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - user should re-login
      console.error("Unauthorized: Token expired or invalid");
    }
    return Promise.reject(error);
  }
);

export default api;