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

    app.get("/foods", async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query.addedByEmail = email;
      }
      const result = await foodsCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const updates = req.body;
      const userEmail = req.body.addedByEmail;

      const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
      if (!food) {
        return res.status(404).send({ message: "Food not found" });
      }

      if (food.addedByEmail !== userEmail) {
        return res
          .status(403)
          .send({ message: "You are not authorized to update this food" });
      }

      const result = await foodsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updates }
      );
      res.send(result);
    });

    app.delete("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const userEmail = req.body.addedByEmail;

      const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
      if (!food) {
        return res.status(404).send({ message: "Food not found" });
      }

      if (food.addedByEmail !== userEmail) {
        return res
          .status(403)
          .send({ message: "You are not authorized to delete this food" });
      }

      const result = await foodsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // 🥘 Add New Food
    app.post("/foods", async (req, res) => {
      const food = req.body;
      const result = await foodsCollection.insertOne(food);
      res.send(result);
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
