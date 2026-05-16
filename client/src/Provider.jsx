import { createContext, useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import auth from "./firebase.config";
import axios from "axios";

export const ContextData = createContext(null);

const Provider = ({ children }) => {
  const [reFetch, setReFetch] = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState([]);
  const [customer, setCustomer] = useState([]);
  const [mainBalance, setMainBalance] = useState(0);
  const [stock, setStock] = useState([]);
  const [user, setUser] = useState(null);
  const [count, setCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [supplierCount, setSupplierCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchSupplier, setSearchSupplier] = useState("");
  const [searchStock, setSearchStock] = useState("");
  const [searchCustomer, setSearchCustomer] = useState("");
  const [tokenReady, setTokenReady] = useState(false);

  // Helper for authenticated requests inside Provider
  const authAxios = useCallback((config) => {
    const token = localStorage.getItem("jwtToken");
    const headers = { ...config.headers };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return axios({
      ...config,
      baseURL: import.meta.env.VITE_API_URL,
      headers,
    });
  }, []);

  let userName;
  user?.email === "asad4design@gmail.com"
    ? (userName = "ASAD1010")
    : user?.email === "mozumdarhattraders@gmail.com"
    ? (userName = "ARIF2020")
    : user?.email === "shop@mail.com"
    ? (userName = "DEMO")
    : user?.email === "gooogle.sarwar@mail.com"
    ? (userName = "DEVELOPER")
    : null;

  // Token validation helper
  const validateTokenHelper = async (token) => {
    if (!token) return null;
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/validate-token`, { token });
      if (response.data.success) {
        return response.data.user;
      }
    } catch (error) {
      console.error("Token validation failed:", error);
    }
    localStorage.removeItem("jwtToken");
    return null;
  };

  // Authentication functions
  const loginWithEmail = (email, password) => {
    setLoading(true);
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logOut = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      localStorage.removeItem("jwtToken");
      setUser(null);
      setTokenReady(false);
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setLoading(false);
    }
  };

  // Data fetching useEffects with auth guards
  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({
      url: "/customers",
      params: {
        page: currentPage,
        size: itemsPerPage,
        search: searchCustomer,
      },
    })
      .then((data) => {
        setCustomer(data.data.result);
        setCustomerCount(data.data.count);
      })
      .catch((err) => {
        console.error("Error fetching customers:", err);
      });
  }, [reFetch, currentPage, itemsPerPage, searchCustomer, authAxios, user, tokenReady]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({ url: "/categories" }).then((data) => setCategories(data.data));
  }, [reFetch, user, tokenReady, authAxios]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({ url: "/brands" }).then((data) => setBrands(data.data));
  }, [reFetch, user, tokenReady, authAxios]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({ url: "/units" }).then((data) => setUnits(data.data));
  }, [reFetch, user, tokenReady, authAxios]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({
      url: "/products",
      params: {
        disablePagination: true,
      },
    })
      .then((data) => {
        setAllProducts(data.data.products);
      })
      .catch((error) => {
        console.error("Error fetching all products:", error);
      });
  }, [reFetch, user, tokenReady, authAxios]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({
      url: "/products",
      params: {
        userEmail: user?.email,
        page: currentPage,
        size: itemsPerPage,
        search: searchTerm,
      },
    })
      .then((data) => {
        setProducts(data.data.products);
        setProductCount(data.data.count);
      });
  }, [reFetch, currentPage, itemsPerPage, searchTerm, authAxios, user, tokenReady]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({ url: "/stockCount" })
      .then((res) => {
        setCount(res.data.count);
      })
      .catch((err) => {
        console.error("Error fetching stockCount:", err);
      });
  }, [reFetch, user, tokenReady, authAxios]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({ url: "/customerCount" })
      .then((res) => {
        setCustomerCount(res.data.count);
      })
      .catch((err) => {
        console.error("Error fetching customerCount:", err);
      });
  }, [reFetch, user, tokenReady, authAxios]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({ url: "/productTotalCount" })
      .then((res) => {
        setProductCount(res.data.count);
      })
      .catch((err) => {
        console.error("Error fetching productTotalCount:", err);
      });
  }, [reFetch, user, tokenReady, authAxios]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({
      url: "/suppliers",
      params: {
        userEmail: user?.email,
        page: currentPage,
        size: itemsPerPage,
        search: searchSupplier,
      },
    })
      .then((data) => {
        setSupplier(data.data.result);
        setSupplierCount(data.data.count);
      })
      .catch((err) => {
        console.error("Error fetching suppliers:", err);
      });
  }, [reFetch, currentPage, itemsPerPage, searchSupplier, authAxios, user, tokenReady]);

  useEffect(() => {
    if (!user || !tokenReady) return;
    authAxios({ url: "/supplierTotalCount" })
      .then((res) => {
        setSupplierCount(res.data.count);
      })
      .catch((err) => {
        console.error("Error fetching supplierTotalCount:", err);
      });
  }, [reFetch, user, tokenReady, authAxios]);

  // Firebase authentication listener combined with JWT management
  useEffect(() => {
    const handleAuthChange = async (currentUser) => {
      console.log("Auth change detected:", currentUser?.email);
      setLoading(true);
      if (currentUser) {
        const token = localStorage.getItem("jwtToken");
        let validatedUser = null;
        if (token) {
          console.log("Found token, validating...");
          validatedUser = await validateTokenHelper(token);
        }

        if (!validatedUser) {
          console.log("No valid token, fetching new one...");
          try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/jwt`, { email: currentUser.email });
            console.log("New token acquired");
            localStorage.setItem("jwtToken", res.data.token);
            setUser(currentUser);
            setTokenReady(true);
          } catch (err) {
            console.error("Error getting JWT:", err);
            setUser(null);
            setTokenReady(false);
            toast.error("Security token failed. Please try logging in again.");
          }
        } else {
          console.log("Token validated successfully");
          setUser(currentUser);
          setTokenReady(true);
        }
      } else {
        console.log("No user logged in");
        setUser(null);
        setTokenReady(false);
      }
      setLoading(false);
    };

    const unSubscribe = onAuthStateChanged(auth, handleAuthChange);
    return () => unSubscribe();
  }, []);

  const info = {
    userName,
    logOut,
    loginWithEmail,
    user,
    setUser,
    categories,
    brands,
    units,
    products,
    allProducts,
    loading,
    setReFetch,
    reFetch,
    supplier,
    mainBalance,
    stock,
    customer,
    itemsPerPage,
    setItemsPerPage,
    currentPage,
    setCurrentPage,
    count,
    customerCount,
    productCount,
    supplierCount,
    setSearchTerm,
    setSearchStock,
    setCustomer,
    setCustomerCount,
    setSupplier,
    setSupplierCount,
    setMainBalance,
    searchStock,
    setStock,
    setCount,
    setSearchCustomer,
    setSearchSupplier,
    tokenReady,
  };

  return <ContextData.Provider value={info}>{children}</ContextData.Provider>;
};

export default Provider;
