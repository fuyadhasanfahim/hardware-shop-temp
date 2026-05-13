import { createContext, useEffect, useState } from "react";
import useAxiosSecure from "./Components/hooks/useAxiosSecure";
import { toast } from "react-toastify";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import auth from "./firebase.config";
import axios from "axios";
import useAxiosProtect from "./Components/hooks/useAxiosProtect";

export const ContextData = createContext(null);

const Provider = ({ children }) => {
  const axiosSecure = useAxiosSecure();
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
  const [count, setCount] = useState({});
  const [customerCount, setCustomerCount] = useState({});
  const [productCount, setProductCount] = useState({});
  const [supplierCount, setSupplierCount] = useState({});
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchSupplier, setSearchSupplier] = useState("");
  const [searchStock, setSearchStock] = useState("");
  const [searchCustomer, setSearchCustomer] = useState("");
  const [tokenReady, setTokenReady] = useState(false);

  const axiosProtect = useAxiosProtect();

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

  // Token validation logic
  const validateToken = async () => {
    const token = localStorage.getItem("jwtToken");
    if (token) {
      try {
        const response = await axios.post("http://localhost:9000/validate-token", { token });
        if (response.data.success) {
          setUser(response.data.user); // Set user if token is valid
          setTokenReady(true);
        } else {
          localStorage.removeItem("jwtToken");
          setUser(null);
        }
      } catch (error) {
        console.error("Error validating token:", error);
        localStorage.removeItem("jwtToken");
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setLoading(false); // Stop loading after token validation
  };

  // Authentication functions
  const loginWithEmail = (email, password) => {
    setLoading(true);
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logOut = async () => {
    setLoading(true);
    try {
      await signOut(auth); // Await the signOut process
      localStorage.removeItem("jwtToken"); // Remove token from localStorage
      setUser(null); // Clear user
      setTokenReady(false); // Clear token state
    } catch (error) {
      console.error("Error logging out:", error); // Handle any errors
    } finally {
      setLoading(false); // Always stop loading, whether successful or not
    }
  };

  // Data fetching useEffects
  useEffect(() => {
    axiosSecure
      .get("/customers", {
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
        toast("Error fetching data", err);
      });
  }, [reFetch, currentPage, itemsPerPage, searchCustomer, axiosSecure]);

  useEffect(() => {
    axiosSecure.get("/categories").then((data) => setCategories(data.data));
  }, [reFetch]);

  useEffect(() => {
    axiosSecure.get("/brands").then((data) => setBrands(data.data));
  }, [reFetch]);

  useEffect(() => {
    axiosSecure.get("/units").then((data) => setUnits(data.data));
  }, [reFetch]);

  useEffect(() => {
    axiosSecure
      .get("/products", {
        params: {
          disablePagination: true, // Disable pagination for this request
        },
      })
      .then((data) => {
        setAllProducts(data.data.products); // Now you get all products
      })
      .catch((error) => {
        console.error("Error fetching products:", error);
      });
  }, [reFetch]);

  useEffect(() => {
    axiosSecure
      .get("/products", {
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
        setLoading(false);
      });
  }, [reFetch, currentPage, itemsPerPage, searchTerm, axiosSecure]);

  useEffect(() => {
    axiosSecure
      .get("/stockCount")
      .then((res) => {
        setCount(res.data.count);
      })
      .catch((err) => {
        toast.error("Server error", err);
      });
  }, [reFetch]);

  useEffect(() => {
    axiosSecure
      .get("/customerCount")
      .then((res) => {
        setCustomerCount(res.data.count);
      })
      .catch((err) => {
        toast.error("Server error", err);
      });
  }, [reFetch]);

  useEffect(() => {
    axiosSecure
      .get("/productTotalCount")
      .then((res) => {
        setProductCount(res.data.count);
      })
      .catch((err) => {
        toast.error("Server error", err);
      });
  }, [reFetch]);

  useEffect(() => {
    axiosSecure
      .get("/suppliers", {
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
        toast("Error fetching data", err);
      });
  }, [reFetch, currentPage, itemsPerPage, searchSupplier, axiosSecure]);

  useEffect(() => {
    axiosSecure
      .get("/supplierTotalCount")
      .then((res) => {
        setSupplierCount(res.data.count);
      })
      .catch((err) => {
        toast.error("Server error", err);
      });
  }, [reFetch]);

  // Firebase authentication listener
  useEffect(() => {
    const unSubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => {
      unSubscribe();
    };
  }, []);

  // Validate token on app load
  useEffect(() => {
    validateToken();
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
  };

  return <ContextData.Provider value={info}>{children}</ContextData.Provider>;
};

export default Provider;
