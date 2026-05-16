import React, { useContext, useState, useEffect } from "react";
import { IoEyeOffOutline, IoEyeOutline } from "react-icons/io5";
import { MdOutlineMail } from "react-icons/md";
import { RiLockPasswordLine } from "react-icons/ri";
import { useLocation, useNavigate } from "react-router-dom";
import { ContextData } from "../../Provider";
import Swal from "sweetalert2";
import logo from '../../assets/images/logo_white.png';

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const { loginWithEmail, user, tokenReady, loading } = useContext(ContextData);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  // Redirect if already logged in and token is ready
  useEffect(() => {
    if (user && tokenReady) {
      console.log("Login: User and Token ready, navigating to", from);
      navigate(from, { replace: true });
    }
  }, [user, tokenReady, navigate, from]);


  const handleEmailLogin = (e) => {
    e.preventDefault();

    const email = e.target.email.value;
    const password = e.target.password.value;

    loginWithEmail(email, password)
      .then((result) => {
        console.log("Firebase login success");
        // No need to navigate here, the useEffect will handle it when tokenReady becomes true
        Swal.fire({
          title: 'Login successful',
          text: 'Acquiring security token...',
          icon: 'success',
          showConfirmButton: false,
          timer: 2000
        });
      })
      .catch((error) => {
        console.error("Firebase login error:", error);
        Swal.fire({
          title: 'Error',
          text: error.message,
          icon: 'error',
        });
      });
  };

  return (
    <div className="">
      <div className="fanwood flex justify-center items-center lg:py-8 px-4 bg-gray-800 h-[100vh]">
        <div className="flex flex-col bg-gray-700 lg:p-14 md:p-10 p-5 lg:w-1/2 md:w-2/3 gap-3 mx-auto max-w-screen-2xl lg:bg-opacity-90 shadow-md border rounded-md text-white">
          <div className="flex justify-center mb-5"><img src={logo} alt="Logo" className="w-48" /></div>

          <h2 className="text-center text-2xl font-bold mb-5 uppercase">Sign In</h2>

          <form className="flex flex-col gap-5" onSubmit={handleEmailLogin}>
            <label className="input input-bordered flex items-center gap-2 text-black bg-white">
              <MdOutlineMail className="text-gray-500" />
              <input
                type="email"
                name="email"
                placeholder="Email"
                required
                className="w-full bg-transparent outline-none"
              />
            </label>

            <label className="input input-bordered flex items-center gap-2 relative text-black bg-white">
              <RiLockPasswordLine className="text-gray-500" />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                required
                className="w-full pr-10 bg-transparent outline-none"
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 cursor-pointer text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <IoEyeOutline /> : <IoEyeOffOutline />}
              </span>
            </label>

            <button 
              disabled={loading}
              className={`py-3 px-5 rounded-md w-full font-bold uppercase transition-all ${
                loading 
                  ? "bg-gray-500 cursor-not-allowed" 
                  : "bg-green-600 hover:bg-green-700 active:scale-95 shadow-lg shadow-green-900/20"
              } text-white`}
            >
              {loading ? "Authenticating..." : "Login"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default Login;
