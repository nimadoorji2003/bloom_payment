const express = require("express");
const bodyParser = require("body-parser");
const engines = require("consolidate");
const paypalRestSdk = require("paypal-rest-sdk");
const session = require("express-session");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");

// Load environment variables
dotenv.config();

const paypal = paypalRestSdk;
const app = express();

// Set up EJS template engine
app.engine("ejs", engines.ejs);
app.set("views", "./views");
app.set("view engine", "ejs");

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Generate a random secret key for session
function generateRandomString(length = 32) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

const secretKey = generateRandomString();

// Session configuration
app.use(
  session({
    secret: secretKey,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true in production with HTTPS
  })
);

// PayPal API credentials
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

paypal.configure({
  mode: "sandbox", // sandbox or live
  client_id: PAYPAL_CLIENT_ID,
  client_secret: PAYPAL_CLIENT_SECRET,
});

// Home route
app.get("/", (req, res) => {
  res.render("index");
});

// Route for initiating PayPal payment
app.post("/paypal", async (req, res) => {
  try {
    const { cart } = req.body;

    // Store cart in session for later use
    req.session.cart = cart;
    console.log("Stored Cart in Session:", req.session.cart);

    // Create PayPal payment object
    const create_payment_json = {
      intent: "sale",
      payer: {
        payment_method: "paypal",
      },
      redirect_urls: {
        return_url: "http://localhost:8880/success",
        cancel_url: "http://localhost:8880/cancel",
      },
      transactions: [
        {
          item_list: {
            items: cart.map((item) => ({
              name: item.name,
              price: item.price.toFixed(2),
              currency: "USD",
              quantity: 1, // Set quantity to 1 since you are only passing name and price
            })),
          },
          amount: {
            currency: "USD",
            total: item.price.toFixed(2),
          },
          description: "Payment for Bloom Bhutan flowers.",
        },
      ],
    };

    // Create PayPal payment
    paypal.payment.create(create_payment_json, (error, payment) => {
      if (error) {
        console.error("Failed to create payment:", error.response);
        res.status(400).json({
          error: "Failed to create payment.",
          details: error.response.details,
        });
      } else {
        // Extract the approval URL from PayPal response
        const approvalUrl = payment.links.find(
          (link) => link.rel === "approval_url"
        ).href;
        console.log("Create Payment Response:", payment);
        res.json({ redirect_url: approvalUrl });
      }
    });
  } catch (error) {
    console.error("Failed to process PayPal payment:", error);
    res.status(500).json({ error: "Failed to process PayPal payment." });
  }
});

// Success route after PayPal payment approval
app.get("/success", async (req, res) => {
  try {
    console.log("Session ID:", req.sessionID);
    console.log("Session Cart before payment:", req.session.cart);

    const { PayerID, paymentId } = req.query;
    const cart = req.session.cart;

    if (!cart) {
      return res.status(400).send("Cart not found.");
    }

    // Prepare data for payment execution
    const execute_payment_json = {
      payer_id: PayerID,
      transactions: [
        {
          amount: {
            currency: "USD",
            total: item.price.toFixed(2),
          },
        },
      ],
    };

    // Execute PayPal payment
    paypal.payment.execute(
      paymentId,
      execute_payment_json,
      (error, payment) => {
        if (error) {
          console.error("Failed to execute payment:", error.response);
          res.status(500).send("Error processing payment.");
        } else {
          console.log(
            "Payment executed successfully:",
            JSON.stringify(payment)
          );
          res.render("success", { message: "Payment was successful!" });
        }
      }
    );
  } catch (error) {
    console.error("Error processing successful payment:", error);
    res.status(500).send("Error processing payment.");
  }
});

// Cancel route if PayPal payment is cancelled
app.get("/cancel", (req, res) => {
  res.render("cancel", { message: "Payment has been cancelled." });
});

// Start the server
const port = 8880;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
