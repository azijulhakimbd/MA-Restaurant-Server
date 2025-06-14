const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;
const cors = require("cors");

// middleware
app.use(cors());
app.use(express.json());

// MongoDB Connect

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

    // Find all foods
    app.get("/foods", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.addedByEmail = email;
      }
      const cursor = foodsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // could be done but not be done
    app.get("/foodsByEmailAddress", async (req, res) => {
      const email = req.query.email;
      const query = { addedByEmail: email };
      const result = await foodsCollection.find(query).toArray();
      res.send(result);
    });

    // find a food
    app.get("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodsCollection.findOne(query);
      res.send(result);
    });

    // 🥘 Add New Food
    app.post("/foods", async (req, res) => {
      const food = req.body;
      const result = await foodsCollection.insertOne(food);
      res.send(result);
    });

    // Update Food
    app.put("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await foodsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

    // Orders
    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.buyerEmail = email;
      }
      const cursor = ordersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Order by user
    app.post("/orders", async (req, res) => {
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

    // Update food quantity after purchase
    app.patch("/foods/:id", async (req, res) => {
      const foodId = req.params.id;
      const { newQuantity } = req.body;

      try {
        const result = await foodsCollection.updateOne(
          { _id: new ObjectId(foodId) },
          { $set: { quantity: newQuantity } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update quantity." });
      }
    });

    // Delete Order
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid order ID" });
      }

      try {
        const query = { _id: new ObjectId(id) };
        const result = await ordersCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).send({ message: "Order deleted successfully" });
        } else {
          res.status(404).send({ message: "Order not found" });
        }
      } catch (error) {
        console.error("Error deleting order:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // TopFoods
    app.get("/topFoods", async (req, res) => {
      const topFoods = await foodsCollection
        .find()
        .sort({ purchaseCount: -1 })
        .limit(6)
        .toArray();

      res.send(topFoods);
    });
    console.log("Connected to restaurantDB and APIs are ready!");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to Restaurant Management System backend");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
