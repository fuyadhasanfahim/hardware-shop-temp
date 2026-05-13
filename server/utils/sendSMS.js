const axios = require("axios");

/**
 * Sends SMS using BulkSMSBD API.
 * Supports single number or multiple numbers (comma-separated or array).
 * @param {Object} options - Sending options.
 * @param {string|string[]} options.number - Single number, comma-separated string, or array of numbers.
 * @param {string} options.message - The message body.
 */
const sendSMS = async ({ number, message }) => {
    // 1. Prepare numbers: If array or comma-sep, clean each and join.
    const numbersArray = Array.isArray(number) ? number : number.split(",");
    const cleanNumbers = numbersArray
        .map((n) => n.trim().replace(/\D/g, "")) // Remove non-digit characters
        .map((n) => (n.startsWith("01") ? "88" + n : n)) // Format BD local numbers to include 880 prefix
        .filter((n) => n.length >= 10) // Basic validation for BD numbers
        .join(",");

    if (!cleanNumbers) {
        console.warn("[SMS] No valid phone numbers provided.");
        return { response_code: 400, success_message: "No valid numbers" };
    }

    const smsData = {
        api_key: process.env.SMS_API_KEY,
        type: "text", // English text
        senderid: "8809617626643", // Non-masking numeric ID
        number: cleanNumbers,
        message: message,
    };

    try {
        // BulkSMSBD documentation recommends JSON format for "One to Many"
        const response = await axios.post(
            "http://bulksmsbd.net/api/smsapi",
            smsData,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
        return response.data;
    } catch (error) {
        console.error("[SMS] API Error:", error.message);
        return {
            response_code: 500,
            success_message: "Network Error",
            error: error.message,
        };
    }
};

module.exports = sendSMS;
