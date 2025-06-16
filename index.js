const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const admin = require("firebase-admin");

const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// Firebase Admin SDK Initialization
const serviceAccount = require("./restaurant-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// JWT Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("restaurantDB");
    const foodsCollection = db.collection("foods");
    const ordersCollection = db.collection("orders");

    // ✅ Get All Foods (with optional email query)
    app.get("/foods", async (req, res) => {
      const email = req.query.email;
      const query = email ? { addedByEmail: email } : {};
      const result = await foodsCollection.find(query).toArray();
      res.send(result);
    });

    // ✅ Get Single Food by ID
    app.get("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const result = await foodsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // ✅ Add New Food (Private)
    app.post("/foods", verifyToken, async (req, res) => {
      const food = req.body;
      const result = await foodsCollection.insertOne(food);
      res.send(result);
    });

    // ✅ Update Food
    app.put("/foods/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await foodsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // ✅ Get Orders for Logged-in User Only (Private)
    app.get("/orders", verifyToken, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await ordersCollection
        .find({ buyerEmail: email })
        .toArray();
      res.send(result);
    });

    // ✅ Place Order
    app.post("/orders", verifyToken, async (req, res) => {
      const order = req.body;

      try {
        const result = await ordersCollection.insertOne(order);

        await foodsCollection.updateOne(
          { _id: new ObjectId(order.foodId) },
          { $inc: { purchaseCount: order.quantity || 1 } }
        );

        res.status(201).send(result);
      } catch (err) {
        console.error("Error placing order:", err);
        res.status(500).send({ error: "Failed to place order" });
      }
    });

    // ✅ Update Food Quantity After Restock (using $inc)
    app.patch("/foods/:id", verifyToken, async (req, res) => {
      const foodId = req.params.id;
      const { addedQuantity } = req.body;

      try {
        const result = await foodsCollection.updateOne(
          { _id: new ObjectId(foodId) },
          { $inc: { quantity: addedQuantity } }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating quantity:", error);
        res.status(500).send({ message: "Failed to update quantity." });
      }
    });

    // ✅ Delete Order & Restore Quantity
    app.delete("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid order ID" });
      }

      try {
        const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

        if (!order) {
          return res.status(404).send({ message: "Order not found" });
        }

        const deleteResult = await ordersCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (deleteResult.deletedCount === 1) {
          await foodsCollection.updateOne(
            { _id: new ObjectId(order.foodId) },
            { $inc: { quantity: order.quantity } }
          );

          res.status(200).send({
            message: "Order deleted and stock updated successfully",
          });
        } else {
          res.status(404).send({ message: "Order not found" });
        }
      } catch (error) {
        console.error("Error deleting order:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // ✅ Top 6 Best Selling Foods
    app.get("/topFoods", async (req, res) => {
      const topFoods = await foodsCollection
        .find()
        .sort({ purchaseCount: -1 })
        .limit(6)
        .toArray();

      res.send(topFoods);
    });

    console.log("✅ Connected to restaurantDB and APIs are ready!");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

// Root Endpoint
app.get("/", (req, res) => {
  res.send("🍽️ Welcome to Restaurant Management System backend");
});

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
