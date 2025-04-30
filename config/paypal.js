const paypal = require("@paypal/checkout-server-sdk");
require("dotenv").config();

// Configure PayPal SDK
const environment = new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_SECRET
);
const client = new paypal.core.PayPalHttpClient(environment);

// Create order function
const createOrder = async (request) => {
    const orderRequest = new paypal.orders.OrdersCreateRequest();
    orderRequest.requestBody(request);
    
    try {
        const response = await client.execute(orderRequest);
        return {
            id: response.result.id,
            links: response.result.links
        };
    } catch (err) {
        console.error('PayPal create order error:', err);
        throw err;
    }
};

// Capture payment function
const capturePayment = async (orderId) => {
    const captureRequest = new paypal.orders.OrdersCaptureRequest(orderId);
    captureRequest.requestBody({});
    
    try {
        const response = await client.execute(captureRequest);
        return {
            id: response.result.id,
            status: response.result.status
        };
    } catch (err) {
        console.error('PayPal capture payment error:', err);
        throw err;
    }
};

module.exports = {
    createOrder,
    capturePayment
};
