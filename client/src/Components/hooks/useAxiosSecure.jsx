import axios from "axios";
import { useContext, useEffect, useMemo, useRef } from "react";
import { ContextData } from "../../Provider";

const useAxiosSecure = () => {
    const { logOut, tokenReady } = useContext(ContextData) || {};
    
    // Use refs to avoid re-adding interceptors when context changes
    const logOutRef = useRef(logOut);
    const tokenReadyRef = useRef(tokenReady);

    useEffect(() => {
        logOutRef.current = logOut;
        tokenReadyRef.current = tokenReady;
    }, [logOut, tokenReady]);

    // Create the axios instance and add interceptors SYNCHRONOUSLY
    const axiosSecure = useMemo(() => {
        const instance = axios.create({
            baseURL: import.meta.env.VITE_API_URL,
        });

        instance.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('jwtToken');
                console.log(`Axios Request to ${config.url}, token found:`, !!token);
                if (token) {
                    if (!config.headers) {
                        config.headers = {};
                    }
                    config.headers['Authorization'] = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error),
        );



        instance.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401 || error.response?.status === 403) {
                    // Use the ref to check the latest tokenReady state
                    if (tokenReadyRef.current) {
                        try {
                            if (logOutRef.current) {
                                await logOutRef.current();
                            }
                            window.location.href = '/login';
                        } catch (err) {
                            console.error("Error during logout:", err);
                        }
                    }
                }
                return Promise.reject(error);
            },
        );

        return instance;
    }, []); // Empty dependency array means this only runs once

    return axiosSecure;
};

export default useAxiosSecure;