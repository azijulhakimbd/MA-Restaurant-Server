const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const admin = require("firebase-admin");

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin SDK Initialization
const serviceAccount = require("./restaurant-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// JWT Verification Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch {
    res.status(401).send({ message: "Unauthorized access" });
  }
};

// MongoDB setup
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

    // GET all foods or by email
    app.get("/foods", async (req, res) => {
      const query = req.query.email ? { addedByEmail: req.query.email } : {};
      const result = await foodsCollection.find(query).toArray();
      res.send(result);
    });

    // GET single food by ID
    app.get("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const result = await foodsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // POST new food
    app.post("/foods", verifyToken, async (req, res) => {
      const food = req.body;
      food.quantity = Number(food.quantity || 0);
      food.purchaseCount = Number(food.purchaseCount || 0);
      const result = await foodsCollection.insertOne(food);
      res.send(result);
    });

    // PUT update food with ownership check
    app.put("/foods/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const food = await foodsCollection.findOne({ _id: new ObjectId(id) });

      if (!food) return res.status(404).send({ message: "Food not found" });
      if (food.addedByEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden update access" });
      }

      const result = await foodsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // PATCH update quantity (purchase or restock)
    app.patch("/foods/:id", verifyToken, async (req, res) => {
      const foodId = req.params.id;
      const addedQuantity = Number(req.body.addedQuantity);

      if (isNaN(addedQuantity)) {
        return res.status(400).send({ message: "Invalid quantity" });
      }

      const food = await foodsCollection.findOne({ _id: new ObjectId(foodId) });
      if (!food) return res.status(404).send({ message: "Food not found" });

      // Prevent stock going negative
      if (food.quantity + addedQuantity < 0) {
        return res.status(400).send({ message: "Insufficient stock" });
      }

      const result = await foodsCollection.updateOne(
        { _id: new ObjectId(foodId) },
        { $inc: { quantity: addedQuantity } }
      );
      res.send(result);
    });

    // GET orders by logged-in user
    app.get("/orders", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await ordersCollection
        .find({ buyerEmail: email })
        .toArray();
      res.send(result);
    });

    // POST place order
    app.post("/orders", verifyToken, async (req, res) => {
      const order = req.body;

      const food = await foodsCollection.findOne({
        _id: new ObjectId(order.foodId),
      });
      if (!food) return res.status(404).send({ message: "Food not found" });

      const foodQuantity = Number(food.quantity);
      const orderQuantity = Number(order.quantity);

      if (isNaN(foodQuantity) || isNaN(orderQuantity)) {
        return res.status(400).send({ message: "Invalid quantity data type" });
      }

      if (foodQuantity < orderQuantity) {
        return res.status(400).send({ message: "Insufficient stock" });
      }

      // Overwrite spoofable fields
      order.price = Number(food.price);
      order.quantity = orderQuantity;
      order.buyerEmail = req.decoded.email;
      order.date = new Date().toISOString();

      try {
        const insertResult = await ordersCollection.insertOne(order);
        await foodsCollection.updateOne(
          { _id: new ObjectId(order.foodId) },
          {
            $inc: {
              quantity: -orderQuantity,
              purchaseCount: orderQuantity,
            },
          }
        );
        res.status(201).send(insertResult);
      } catch (err) {
        console.error("Order placement error:", err);
        res.status(500).send({ message: "Order placement failed" });
      }
    });

    // DELETE order & restore quantity
    app.delete("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID" });

      const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
      if (!order) return res.status(404).send({ message: "Order not found" });

      if (order.buyerEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      const orderQuantity = Number(order.quantity);
      if (isNaN(orderQuantity)) {
        return res
          .status(400)
          .send({ message: "Invalid stored quantity type" });
      }

      const deleteResult = await ordersCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (deleteResult.deletedCount === 1) {
        await foodsCollection.updateOne(
          { _id: new ObjectId(order.foodId) },
          { $inc: { quantity: orderQuantity } }
        );
        res.send({ message: "Order deleted and stock restored" });
      } else {
        res.status(500).send({ message: "Failed to delete order" });
      }
    });

    // GET Top 6 best-selling foods
    app.get("/topFoods", async (req, res) => {
      const topFoods = await foodsCollection
        .find()
        .sort({ purchaseCount: -1 })
        .limit(6)
        .toArray();
      res.send(topFoods);
    });

    console.log("✅ Connected to restaurantDB and APIs ready!");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("🍽️ Welcome to Restaurant Management System backend");
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server listening on port ${process.env.PORT || 3000}`);
});
