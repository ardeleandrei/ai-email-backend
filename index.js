import Fastify from "fastify";
import cors from "@fastify/cors";
import routes from "./src/routes/index.js";

const app = Fastify();

// ✅ Allow requests from your frontend (localhost:3000)
await app.register(cors, {
  origin: "http://localhost:3000", // or true for all origins
  methods: ["GET", "POST", "OPTIONS"],
});

// Register your routes
await app.register(routes);

app.listen({ port: 3001 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`🚀 Server listening at ${address}`);
});
