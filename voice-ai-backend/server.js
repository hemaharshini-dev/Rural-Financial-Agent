import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;

const COLLECTION = "financial-assistant";

// 🔹 Convert text → embedding (HuggingFace)
let extractor;

async function getEmbedding(text) {
  try {
    if (!extractor) {
      console.log("🔄 Loading local model...");
      const { pipeline } = await import("@xenova/transformers");
      extractor = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      );
      console.log("✅ Model loaded");
    }

    const output = await extractor(text, { pooling: "mean", normalize: true });

    return Array.from(output.data); // 384-d vector
  } catch (error) {
    console.error("❌ Local embedding error:", error.message);
    throw error;
  }
}

// 🔹 Add data to Qdrant
app.post("/add", async (req, res) => {
  const { id, text } = req.body;

  try {
    const vector = await getEmbedding(text);

    await axios.put(
      `${QDRANT_URL}/collections/${COLLECTION}/points`,
      {
        points: [
          {
            id,
            vector,
            payload: { text },
          },
        ],
      },
      {
        headers: {
          "api-key": QDRANT_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    res.json({ message: "Data added successfully" });
  } catch (error) {
    console.error("❌ Add error:", error.response?.data || error.message);
    res.status(500).json({ error: "Error adding data" });
  }
});

// 🔹 Search similar data
app.post("/search", async (req, res) => {
  const { query } = req.body;

  try {
    const vector = await getEmbedding(query);

    const response = await axios.post(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      {
        vector,
        limit: 2,
        with_payload: true,
      },
      {
        headers: {
          "api-key": QDRANT_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    const results =
      response.data.result?.map((item) => item.payload?.text) || [];
    console.log("Qdrant response:", response.data);
    res.json({ results });
  } catch (error) {
    console.error("❌ Search error:", error.response?.data || error.message);
    res.status(500).json({ error: "Search failed" });
  }
});

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const vector = await getEmbedding(message);

    const response = await axios.post(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      {
        vector,
        limit: 2,
        with_payload: true,
      },
      {
        headers: {
          "api-key": QDRANT_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    const results =
      response.data.result?.map((item) => item.payload?.text) || [];

    // 🔥 Combine into natural response
    const reply = results.join(" ");

    res.json({
      reply:
        reply ||
        "Sorry, I could not find the answer. Please try asking differently.",
    });
  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ reply: "Something went wrong" });
  }
});

app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});
