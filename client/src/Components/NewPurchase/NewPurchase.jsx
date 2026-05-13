import { useContext, useEffect, useState } from "react";
import AddProduct from "../AddProduct/AddProduct";
import { ContextData } from "../../Provider";
import { toast } from "react-toastify";
import AddSupplier from "../AddSupplier/AddSupplier";
import Swal from "sweetalert2";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import useAxiosSecure from "../hooks/useAxiosSecure";
import Select from "react-select"; // Import react-select

const NewPurchase = () => {
  const {
    user,
    allProducts,
    supplier,
    setReFetch,
    reFetch,
    mainBalance,
    userName,
    setItemsPerPage,
    supplierCount,
  } = useContext(ContextData);
  const axiosSecure = useAxiosSecure();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [normsQuantity, setNormsQuantity] = useState("");
  const [tempProductList, setTempProductList] = useState([]);
  let [discount, setDiscount] = useState("");
  const [grandTotal, setGrandTotal] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [dueAmount, setDueAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contactNumberValue, setContactNumberValue] = useState("");
  const [newSupplier, setNewSupplier] = useState({});

  const handleInputPurchaseQuantity = (event) => {
    const purchaseQuantityValue = event.target.value;
    const onlyNumberRegex = /^\d*\.?\d*$/;
    if (onlyNumberRegex.test(purchaseQuantityValue)) {
      setPurchaseQuantity(purchaseQuantityValue);
    }
  };

  const handleInputPurchasePrice = (event) => {
    const purchasePriceValue = event.target.value;
    const onlyNumberRegex = /^\d*\.?\d*$/;
    if (onlyNumberRegex.test(purchasePriceValue)) {
      setPurchasePrice(purchasePriceValue);
    }
  };

  const handleInputSalesPrice = (event) => {
    const salesPriceValue = event.target.value;
    const onlyNumberRegex = /^\d*\.?\d*$/;
    if (onlyNumberRegex.test(salesPriceValue)) {
      setSalesPrice(salesPriceValue);
    }
  };

  const handleInputNormsQuantity = (event) => {
    const normsQuantityValue = event.target.value;
    const onlyNumberRegex = /^\d*\.?\d*$/;
    if (onlyNumberRegex.test(normsQuantityValue)) {
      setNormsQuantity(normsQuantityValue);
    }
  };

  // Transform products array into options array for react-select
  const productOptions = allProducts.map((product) => ({
    value: product.productCode,
    label: `${product.productCode}-${product.productName}`,
  }));

  // Handle product change
  const handleProductChange = (selectedOption) => {
    const selectedProduct = allProducts.find(
      (product) => product.productCode === selectedOption?.value
    );
    setSelectedProduct(selectedProduct);
    setUnit(selectedProduct?.unitName);
    setBrand(selectedProduct?.brandName);
    setCategory(selectedProduct?.categoryName);
  };

  // add purchase product for temporary display

  const handlePurchaseProduct = (e) => {
    e.preventDefault();
    if (!selectedProduct) {
      return toast.error("Select product");
    }
    const userMail = user?.email;

    const form = e.target;
    const productID = selectedProduct.productCode;
    const productTitle = selectedProduct.productName;
    const purchaseQuantity = form.purchase_quantity.value;
    const purchaseUnit = unit;
    const purchasePrice = form.purchase_price.value;
    const salesPrice = form.sales_price.value;
    const reOrderQuantity = parseInt(normsQuantity);
    const storageLocation = form.storage.value;
    if (storageLocation === "Storage") {
      return toast.error("Select storage");
    }
    const purchaseProductInfo = {
      productID,
      productTitle,
      brand,
      purchaseQuantity,
      purchaseUnit,
      purchasePrice,
      salesPrice,
      storageLocation,
      reOrderQuantity,
      category,
      userMail,
    };

    axiosSecure
      .post(`/adTempPurchaseProductList`, purchaseProductInfo)
      .then((data) => {
        if (data.data.insertedId) {
          toast.success("Product added");
          form.reset();
          setPurchaseQuantity("");
          setPurchasePrice("");
          setSalesPrice("");
          setNormsQuantity("");
          setReFetch(!reFetch);
        } else {
          toast.error(data.data);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        toast.error("Server error", error);
      });
  };

  // get purchase product temporarily list

  useEffect(() => {
    axiosSecure
      .get(`/tempPurchaseProductList/${user?.email}`)
      .then((data) => {
        setTempProductList(data.data);
      })
      .catch((err) => {
        toast.error("Server error", err);
      });
  }, [reFetch]);

  // delete temp product
  const handleTempProduct = (_id) => {
    axiosSecure
      .delete(`/deleteTempProduct/${_id}`)
      .then((data) => {
        if (data.data.deletedCount === 1) {
          setReFetch(!reFetch);
          setDiscount("");
        } else {
          toast.error(data.data);
        }
      })
      .catch((error) => {
        toast.error("Server error", error);
      });
  };

  const purchaseProductListAmount = tempProductList.map(
    (product) => product.purchaseQuantity * product.purchasePrice
  );
  let purchaseAmount = 0;
  for (let i = 0; i < purchaseProductListAmount.length; i++) {
    purchaseAmount += purchaseProductListAmount[i];
  }

  let purchaseInvoiceAmount = parseFloat(purchaseAmount).toFixed(2);
  useEffect(() => {
    setGrandTotal(purchaseInvoiceAmount);
    setDueAmount(purchaseInvoiceAmount);
  }, [purchaseInvoiceAmount]);

  const handleDiscountOnchange = (event) => {
    const discountValue = event.target.value;
    const onlyNumberRegex = /^\d*\.?\d*$/;
    if (onlyNumberRegex.test(discountValue)) {
      setDiscount(discountValue);
    }
    const discountNumber = parseInt(document.getElementById("discount").value);
    if (discountNumber) {
      const discountAmount = parseFloat(
        (purchaseInvoiceAmount * discountNumber) / 100
      );
      const newGrandTotal = parseFloat(
        purchaseInvoiceAmount - discountAmount
      ).toFixed(2);
      setGrandTotal(newGrandTotal);
      setDueAmount(newGrandTotal);
    } else {
      setGrandTotal(purchaseInvoiceAmount);
      setDueAmount(purchaseInvoiceAmount);
    }
  };

  // pay amount onchange
  const handlePayAmountOnchange = (event) => {
    const payAmountValue = event.target.value;
    const onlyNumberRegex = /^\d*\.?\d*$/;
    if (onlyNumberRegex.test(payAmountValue)) {
      setPayAmount(payAmountValue);
    }
    const payAmountNumber = parseFloat(
      document.getElementById("pay-amount").value
    );
    const dueAmount = parseFloat(grandTotal - payAmountNumber).toFixed(2);
    setDueAmount(dueAmount);
  };

  const handleNext = () => {
    setItemsPerPage(supplierCount);
    document.getElementById("purchase_step_1").classList.add("hidden");
    document.getElementById("add_product").classList.add("hidden");
    document.getElementById("purchase_step_2").classList.remove("hidden");
  };
  const handlePrevious = () => {
    document.getElementById("purchase_step_1").classList.remove("hidden");
    document.getElementById("add_product").classList.remove("hidden");
    document.getElementById("purchase_step_2").classList.add("hidden");
  };

  //   change the supplier name if supplier changed
  // const handleSupplierChange = (event) => {
  //   const selectedIndex = event.target.selectedIndex;

  //   if (selectedIndex > 0) {
  //     const selectedSupplier = supplier[selectedIndex - 1];
  //     setSelectedSupplier(selectedSupplier);

  //     // Set the unit of the selected product
  //     setSupplierSerial(selectedSupplier.serial);
  //   } else {
  //     setSelectedSupplier(null);
  //     setSupplierSerial("");
  //   }
  // };

  const navigate = useNavigate();

  // .............................................................................
  const handleInputContactNumber = (event) => {
    const supplierNumberValue = event.target.value;
    const onlyNumberRegex = /^[0-9]{0,11}$/;
    if (onlyNumberRegex.test(supplierNumberValue)) {
      setContactNumberValue(supplierNumberValue);
    }
    axiosSecure
      .post(`/getSupplier/${supplierNumberValue}`)
      .then((response) => {
        setNewSupplier(response.data);
      })
      .catch((err) => {
        toast.error(err);
      });
  };
  // .............................................................................

  const handleProceed = (e) => {
    e.preventDefault();

    // Check if the form is already being submitted
    if (isLoading) return;

    setIsLoading(true); // Set loading to true

    const date = moment(new Date()).format("DD.MM.YYYY");
    const supplierName = e.target.supplier_name.value;
    const contactNumber = e.target.supplier_mobile.value;
    const supplierAddress = e.target.supplier_address.value;
    const contactPerson = e.target.contact_person.value;
    let totalAmount = parseFloat(
      parseFloat(e.target.total_amount.value).toFixed(2)
    );
    const discountAmount = parseFloat(
      parseFloat(e.target.discount_amount.value).toFixed(2)
    );
    const grandTotal = parseFloat(
      parseFloat(e.target.grand_total.value).toFixed(2)
    );
    const dueAmount = parseFloat(
      parseFloat(e.target.due_amount.value).toFixed(2)
    );

    if (contactNumber.length < 11) {
      setIsLoading(false); // Reset loading state
      return toast.error("Invalid mobile number");
    }
    const finalPayAmount = parseFloat(parseFloat(payAmount).toFixed(2));
    const balance = mainBalance[0]?.mainBalance;

    if (finalPayAmount > balance) {
      setIsLoading(false); // Reset loading state
      return toast.error("Insufficient balance");
    }
    const userMail = user?.email;

    const purchaseInvoiceInfo = {
      userName,
      date,
      supplierName,
      contactNumber,
      contactPerson,
      supplierAddress,
      totalAmount,
      discountAmount,
      grandTotal,
      finalPayAmount,
      dueAmount,
      userMail,
    };
    axiosSecure
      .post("/newPurchaseInvoice", purchaseInvoiceInfo)
      .then((data) => {
        if (data.data.insertedId) {
          setReFetch(!reFetch);
          Swal.fire({
            title: "Success",
            text: "Purchase invoice created successfully",
            icon: "success",
          });
          setItemsPerPage(20);
          e.target.reset();
          setDiscount("");
          setGrandTotal("");
          setPayAmount("");
          setDueAmount("");
          navigate("/purchase");
        } else {
          toast.error(data.data);
        }
      })
      .catch((error) => {
        toast.error("Server error", error);
      })
      .finally(() => {
        setIsLoading(false); // Reset loading state
      });
  };

  return (
    <div className="px-5 pb-10">
      <div className="flex justify-between items-center py-2">
        <h2 className=" text-xl uppercase font-bold">New purchase order:</h2>
        <div className="flex gap-2 items-center">
          <div className="bg-green-500 rounded-md">
            <AddProduct />
          </div>
          <div className="bg-green-500 rounded-md">
            <AddSupplier />
          </div>
        </div>
      </div>

      <div className="mt-5 border py-10 px-5 border-gray-200 shadow-md rounded-md">
        {/* new purchase form */}
        <form
          onSubmit={handlePurchaseProduct}
          className="flex flex-col gap-3"
          id="add_product"
        >
          <label className="flex gap-5 items-center flex-wrap">
            <div className="w-[58%]">
              <Select
                options={productOptions}
                onChange={handleProductChange}
                placeholder="Search and select a product"
                isClearable
                className="flex-grow"
              />
            </div>

            <input
              onChange={handleInputPurchaseQuantity}
              type="text"
              name="purchase_quantity"
              value={purchaseQuantity}
              placeholder="Quantity"
              className="border p-2 rounded-md outline-none"
              size={5}
              required
            />

            <input
              type="text"
              name="purchase_unit"
              defaultValue={unit}
              readOnly
              placeholder="Unit"
              size={5}
              className="border p-2 rounded-md outline-none"
            />

            <input
              onChange={handleInputPurchasePrice}
              type="text"
              name="purchase_price"
              value={purchasePrice}
              placeholder="Purchase price"
              size={10}
              required
              className="border p-2 rounded-md outline-none"
            />
          </label>
          <label className="flex gap-5 items-center flex-wrap mt-3">
            <input
              onChange={handleInputSalesPrice}
              type="text"
              name="sales_price"
              value={salesPrice}
              placeholder="Sales price"
              size={10}
              required
              className="border p-2 rounded-md outline-none"
            />

            <select
              name="storage"
              className="border p-2 rounded-md outline-none"
            >
              <option defaultValue="Storage">Storage</option>
              <option value="W-1">W-1</option>
              <option value="W-2">W-2</option>
              <option value="W-3">W-3</option>
            </select>

            <input
              onChange={handleInputNormsQuantity}
              type="text"
              name="norms_quantity"
              value={normsQuantity}
              placeholder="Re-order QTY"
              size={10}
              required
              className="border p-2 rounded-md outline-none"
            />

            <button className="bg-green-500 text-white py-2 px-3 rounded-md cursor-pointer">
              Add product
            </button>
          </label>
        </form>
        {/* show temp product list */}

        {tempProductList.length > 0 && (
          <div
            className="overflow-x-auto mt-8 border p-5 rounded-md"
            id="purchase_step_1"
          >
            <p className="uppercase mb-2 font-bold">
              Invoice amount:{" "}
              <span className="text-red-500 bg-yellow-300 rounded-sm px-1 font-bold">BDT {purchaseInvoiceAmount}</span>
            </p>
            <table className="table table-zebra">
              {/* head */}
              <thead className="bg-blue-400 text-white">
                <tr>
                  <td>SL No</td>
                  <td>Product ID</td>
                  <td>Product Name</td>
                  <td>QTY</td>
                  <td>Unit</td>
                  <td>Price</td>
                  <td>Amount</td>
                  <td className="text-center">Action</td>
                </tr>
              </thead>
              <tbody>
                {/* row 1 */}
                {tempProductList ? (
                  tempProductList.map((product, i) => (
                    <tr key={i}>
                      <td className="w-[5%]">{i + 1}</td>
                      <td className="w-[10%]">{product.productID}</td>
                      <td>{product.productTitle}</td>
                      <td className="w-[10%]">
                        {parseFloat(product.purchaseQuantity).toFixed(2)}
                      </td>
                      <td className="w-[10%]">{product.purchaseUnit}</td>
                      <td className="w-[10%]">
                        {parseFloat(product.purchasePrice).toFixed(2)}
                      </td>
                      <td className="w-[10%]">
                        {(
                          product.purchasePrice * product.purchaseQuantity
                        ).toFixed(2)}
                      </td>
                      <td className="w-[5%] text-center text-red-500 font-bold">
                        <button
                          onClick={() => handleTempProduct(product._id)}
                          title="Delete this item"
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <p>No product selected</p>
                )}
              </tbody>
            </table>
            <div className="flex justify-end mt-5">
              <button
                onClick={handleNext}
                className="py-1 px-5 rounded-md mt-3 bg-green-500 text-white"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div
          className="mt-5 border p-5 rounded-md mb-5 hidden"
          id="purchase_step_2"
        >
          <form onSubmit={handleProceed} className="grid grid-cols-2 gap-10">
            {/* Left Column: Mobile, Supplier, and Address */}
            <div className="space-y-7">
              <label className="flex gap-2 items-center">
                <span className="w-24 font-bold">Mobile:</span>
                <input
                  type="text"
                  name="supplier_mobile"
                  onChange={handleInputContactNumber}
                  value={contactNumberValue}
                  required
                  placeholder="Mobile"
                  className="border py-1 px-2 rounded-md outline-none focus:bg-gray-200 w-full"
                />
              </label>

              <label className="flex gap-2 items-center">
                <span className="w-24 font-bold">Supplier:</span>
                <input
                  type="text"
                  name="supplier_name"
                  defaultValue={newSupplier.supplierName}
                  required
                  className="border py-1 px-2 rounded-md outline-none focus:bg-gray-200 w-full"
                  placeholder="Name"
                />
              </label>

              <label className="flex gap-2 items-center">
                <span className="w-24 font-bold">Address:</span>
                <input
                  type="text"
                  name="supplier_address"
                  defaultValue={newSupplier.supplierAddress}
                  required
                  className="border py-1 px-2 rounded-md outline-none focus:bg-gray-200 w-full"
                  placeholder="Address"
                />
              </label>

              <label className="flex gap-2 items-center">
                <span className="w-24 font-bold">Contact person:</span>
                <input
                  type="text"
                  name="contact_person"
                  defaultValue={newSupplier.contactPerson}
                  className="border py-1 px-2 rounded-md outline-none focus:bg-gray-200 w-full"
                  required
                  placeholder="Contact Person"
                />
              </label>
            </div>

            {/* Right Column: Contact person, Total, Discount, Grand Total, Pay Amount, and Due Amount */}
            <div className="space-y-7">
              <label className="flex gap-2 items-center">
                <span className="w-36 font-bold">Total:</span>
                <input
                  type="text"
                  name="total_amount"
                  value={purchaseInvoiceAmount}
                  className="border py-1 px-2 rounded-md outline-none w-full bg-red-100 cursor-not-allowed"
                  disabled
                />
              </label>

              <label className="flex gap-2 items-center">
                <span className="w-36 font-bold">Discount(%):</span>
                <input
                  id="discount"
                  type="text"
                  name="discount_amount"
                  value={discount}
                  className="border py-1 px-2 rounded-md outline-none focus:bg-gray-200 w-full"
                  onChange={handleDiscountOnchange}
                  placeholder="Discount"
                />
              </label>

              <label className="flex gap-2 items-center">
                <span className="w-36 font-bold">Grand total:</span>
                <input
                  type="text"
                  name="grand_total"
                  value={grandTotal}
                  className="border py-1 px-2 rounded-md outline-none w-full bg-red-100 cursor-not-allowed"
                  readOnly
                />
              </label>

              <label className="flex gap-2 items-center">
                <span className="w-36 font-bold">Pay amount:</span>
                <input
                  type="text"
                  name="pay_amount"
                  id="pay-amount"
                  value={payAmount}
                  onChange={handlePayAmountOnchange}
                  placeholder="Amount"
                  required
                  className="border py-1 px-2 rounded-md outline-none focus:bg-gray-200 w-full"
                />
              </label>

              <label className="flex gap-2 items-center">
                <span className="w-36 font-bold">Due amount:</span>
                <input
                  type="text"
                  name="due_amount"
                  value={dueAmount}
                  readOnly
                  className="border py-1 px-2 rounded-md outline-none w-full bg-red-100 cursor-not-allowed"
                />
              </label>
            </div>

            {/* Action Buttons at the bottom, spanning both columns */}
            <div className="col-span-2 flex justify-between mt-5">
              <p
                className="py-1 px-5 rounded-md bg-green-500 text-white cursor-pointer"
                onClick={handlePrevious}
              >
                Previous
              </p>
              <button
                className={`py-1 px-5 rounded-md bg-green-600 text-white ${
                  isLoading ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={isLoading}
              >
                Proceed
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewPurchase;
