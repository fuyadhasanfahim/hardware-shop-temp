import axios from 'axios';
import { useContext, useEffect } from 'react';
import { ContextData } from '../../Provider';
import { toast } from 'react-toastify';

// Create axios instance
const axiosProtect = axios.create({
    baseURL: 'http://localhost:9000',
});

// Axios Interceptor Hook
const useAxiosProtect = () => {
    const { logOut } = useContext(ContextData) || {};  // Fallback to avoid error

    useEffect(() => {
        // Request Interceptor to add token
        const requestInterceptor = axiosProtect.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('jwtToken');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;  // Add token to headers
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Response Interceptor to handle errors
        const responseInterceptor = axiosProtect.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401) {
                    // Token expired or unauthorized access
                    try {
                        if (logOut) {
                            await logOut();
                        }
                        // Redirect manually using window.location
                        window.location.href = '/login'; // Redirect to login page
                    } catch (err) {
                        toast.error(err.message || "Error during logout");
                    }
                }
                return Promise.reject(error);
            }
        );

        // Cleanup interceptors on unmount
        return () => {
            axiosProtect.interceptors.request.eject(requestInterceptor);
            axiosProtect.interceptors.response.eject(responseInterceptor);
        };
    }, [logOut]);

    return axiosProtect;
};

export default useAxiosProtect;
