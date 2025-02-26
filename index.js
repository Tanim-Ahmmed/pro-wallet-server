require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fgufh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("proWallet").collection("users");
    const transactionsCollection = client
      .db("proWallet")
      .collection("transactions");

    //jwt related routes

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verify token

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // use verify agent after verify token

    const verifyAgent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAgent = user?.role === "agent";
      if (!isAgent) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //user related routes

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.status = user.role === "agent" ? "requested" : "approved";
      user.balance = user.role === "agent" ? 100000 : 40;
      const query = {
        $or: [{ email: user.email }, { phone: user.phone }, { nid: user.nid }],
      };
      const existUser = await usersCollection.findOne(query);
      if (existUser) {
        return res.send({ message: "User already exist!", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/users/agent/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let agent = false;
      if (user) {
        agent = user.role === "agent";
      }
      res.send({ agent });
    });

    app.get("/users/email/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    //cash In agent to user

    app.post("/cashIn", verifyToken, verifyAgent, async (req, res) => {
      const { sender, receiver, amount } = req.body;

      await usersCollection.updateOne(
        { phone: sender },
        { $inc: { balance: -amount } }
      );

      await usersCollection.updateOne(
        { phone: receiver },
        { $inc: { balance: amount } }
      );

      const transaction = {
        sender,
        receiver,
        amount,
        type: "Cash In",
        timestamp: new Date(),
      };
      const result =  await transactionsCollection.insertOne(transaction);
      res.send(result);
    });


      //cash Out agent to user

      app.post("/cashOut", verifyToken, async (req, res) => {
        const { sender, receiver, amount } = req.body;
  
        await usersCollection.updateOne(
          { phone: sender },
          { $inc: { balance: -amount } }
        );
  
        await usersCollection.updateOne(
          { phone: receiver },
          { $inc: { balance: amount } }
        );
  
        const transaction = {
          sender,
          receiver,
          amount,
          type: "Cash Out",
          timestamp: new Date(),
        };
        const result =  await transactionsCollection.insertOne(transaction);
        res.send(result);
      });
  


    app.get("/transection", async (req, res) => {
      const result = await transactionsCollection.find().toArray();
      res.send(result);
    });
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Wallet Server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
