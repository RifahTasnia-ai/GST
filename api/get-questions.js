import crypto from "crypto";
import { loadQuestionFile } from "../lib/runtimeStore.js";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
        return res.status(204).end();
    }

    Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const file = req.query.file || "questions.json";

    try {
        const data = await loadQuestionFile(file);
        if (!data) {
            return res.status(404).json({ error: "File not found" });
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.status(200).json(data);
    } catch (err) {
        console.error("[get-questions] Error loading file", err);
        return res.status(500).json({ error: "Failed to load questions file" });
    }
}
